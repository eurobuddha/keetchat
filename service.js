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

MDS.load("./chatschema.js");

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
        // 0.2.0 schema: optional keets:// media reference per message
        MDS.sql("ALTER TABLE `messages` ADD COLUMN IF NOT EXISTS `ref` varchar(512) DEFAULT ''", function () {
            MDS.sql("CREATE TABLE IF NOT EXISTS `contacts` (" +
                " `pubkey` varchar(170) NOT NULL PRIMARY KEY," +
                " `name` varchar(255) NOT NULL," +
                " `added` bigint NOT NULL" +
                ")", cb);
        });
    });
}

function ensureContact(pubkey, senderName, cb) {
    MDS.sql("SELECT pubkey FROM contacts WHERE pubkey='" + esc(pubkey) + "'", function (res) {
        if (res.status && res.rows.length === 0) {
            // default name = the sender's self-declared name, else the FULL pubkey
            var name = senderName || pubkey;
            MDS.sql("INSERT INTO contacts (pubkey, name, added) VALUES " +
                "('" + esc(pubkey) + "','" + esc(name) + "'," + Date.now() + ")", cb);
        } else if (cb) { cb(); }
    });
}

function storeIncoming(data) {
    var from = data.from;
    var via = data.via;
    var m = chatDecode(data.message);           // schema JSON or legacy plain text
    // control states (read/payaddr/payaddr-req/unknown): consumed - no row,
    // no notification, no contact row for the sender
    if (!m.legacy && !isStoredState(m.state)) { return; }
    var msgid = m.id || data.id;                // schema id dedupes across transports
    var ts = m.ts || parseInt(data.ts);
    // dedupe on (peer, message id) - ids are sender-chosen, so a global
    // msgid dedupe would let one peer's id shadow another's message
    MDS.sql("SELECT id FROM messages WHERE msgid='" + esc(msgid) + "' AND pubkey='" + esc(from) + "'", function (res) {
        if (!res.status || res.rows.length > 0) { return; }
        ensureContact(from, m.name, function () {
            var body = contentBody(m);
            MDS.sql("INSERT INTO messages (msgid, pubkey, incoming, body, ts, via, ref) VALUES " +
                "('" + esc(msgid) + "','" + esc(from) + "',1,'" + esc(body) + "'," + ts + ",'" + esc(via) + "','" + esc(m.ref) + "')",
                function () {
                    MDS.log("KeetChat stored message from " + from + " via " + via);
                    MDS.notify("KeetChat: " + (m.name ? m.name + ": " : "new message ") + body.slice(0, 80));
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
