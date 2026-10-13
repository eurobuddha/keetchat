/* KeetChat background service
 *
 * Reference pattern for messaging over keets:
 *  - the node drains the keets sidecar inbox and posts each message as MDS
 *    event "KEETS" (data: id, from, ts, payload base64, message utf8, via)
 *  - this service persists every inbound message to SQL (the event is the
 *    hand-off — the node acks the sidecar inbox once it is posted), and
 *    auto-creates a contact row for first-time senders
 *  - the UI (index.html) reads/writes the same tables; it inserts OUTGOING
 *    messages itself after `keets action:send`, so only this service inserts
 *    incoming ones (no double-insert when the UI is open)
 */

function esc(s) {
    return ("" + s).replace(/'/g, "''");
}

function createTables(cb) {
    MDS.sql("CREATE TABLE IF NOT EXISTS `messages` (" +
        " `id` bigint auto_increment," +
        " `msgid` varchar(80) NOT NULL," +
        " `pubkey` varchar(170) NOT NULL," +       // the OTHER party, 0x + 64 hex
        " `incoming` int NOT NULL," +
        " `body` varchar(262144) NOT NULL," +
        " `ts` bigint NOT NULL," +
        " `via` varchar(16) NOT NULL" +            // direct | mailbox | '' (outgoing pending)
        ")", function () {
        MDS.sql("CREATE TABLE IF NOT EXISTS `contacts` (" +
            " `pubkey` varchar(170) NOT NULL PRIMARY KEY," +
            " `name` varchar(255) NOT NULL," +
            " `added` bigint NOT NULL" +
            ")", cb);
    });
}

function ensureContact(pubkey, cb) {
    MDS.sql("SELECT pubkey FROM contacts WHERE pubkey='" + esc(pubkey) + "'", function (res) {
        if (res.status && res.rows.length === 0) {
            // default name = the full pubkey — never truncate an identifier
            MDS.sql("INSERT INTO contacts (pubkey, name, added) VALUES " +
                "('" + esc(pubkey) + "','" + esc(pubkey) + "'," + Date.now() + ")", cb);
        } else if (cb) { cb(); }
    });
}

function storeIncoming(data) {
    var msgid = data.id;
    var from = data.from;
    var body = data.message;  // utf8 decode done by the node
    var ts = parseInt(data.ts);
    var via = data.via;
    // dedupe on the keets message id
    MDS.sql("SELECT id FROM messages WHERE msgid='" + esc(msgid) + "'", function (res) {
        if (!res.status || res.rows.length > 0) { return; }
        ensureContact(from, function () {
            MDS.sql("INSERT INTO messages (msgid, pubkey, incoming, body, ts, via) VALUES " +
                "('" + esc(msgid) + "','" + esc(from) + "',1,'" + esc(body) + "'," + ts + ",'" + esc(via) + "')",
                function () {
                    MDS.log("KeetChat stored message from " + from + " via " + via);
                    MDS.notify("KeetChat: new message");
                    // nudge any open UI to refresh
                    MDS.comms.broadcast("keetchat-refresh", function () {});
                });
        });
    });
}

MDS.init(function (msg) {
    if (msg.event === "inited") {
        createTables(function () {
            MDS.log("KeetChat service ready");
        });
    } else if (msg.event === "KEETS") {
        storeIncoming(msg.data);
    }
});
