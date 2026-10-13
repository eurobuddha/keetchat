# KeetChat — reference chat over keets

The reference pattern for messaging on the keets transport: contacts + conversations,
pubkey-addressed, E2E encrypted, delivered direct when the peer is online and via
sealed mailbox store-and-forward when they're not. **No server, no host to configure —
your address is your node's keets pubkey.**

Requires a node running with `-keets` (minima-core `main` ≥ `ea37438033` /
`keets-android` ≥ `686d2c504d` — the `keets` RPC command and event bridge).

## Two modes, one page

| mode | when | commands | storage | inbound |
|---|---|---|---|---|
| **RPC** | opened as a plain page against a node RPC port (family nodes — MDS is stripped from them) | `fetch()` to the RPC (CORS is open) | localStorage | polls `keets action:inbox` every 5s, acks after storing |
| **MDS** | installed as a MiniDapp on an MDS-capable node | `MDS.cmd` | MDS SQL (service.js) | MDS event `KEETS` pushed by the node, which acks after posting |

Open `index.html?rpc=http://127.0.0.1:9005` (RPC port = Minima port + 4), or install
`keetchat-<ver>.mds.zip` on an MDS node (`-mdsinit` folder or MiniHub).

## The integration contract (for Atellier / the Salon / any app)

Everything is the `keets` node command — the node holds the sidecar token, apps never
see it:

```
keets action:info                                -> { pubkey, drive, apiport }
keets action:send to:0x<64hex> message:"hi"      -> { delivered: direct | mailbox }
keets action:send to:0x<64hex> datahex:0x..      (hex payload: no quoting pitfalls)
keets action:inbox                               -> [ {id, from, ts, payload b64, message, via} ]
keets action:ack id:<id>
keets action:publish path:/nft/a.png datahex:0x.. -> { url: keets://... , hash }
keets action:fetch url:keets://...               -> { datahex, size }
keets action:pin url:... | pins | unpin drive:...
```

MDS event (only when MDS is enabled — the node pushes and acks for you):

```
{ "event":"KEETS", "data":{ "id":"..", "from":"0x..", "ts":169.., 
  "payload":"<base64>", "message":"<utf8>", "via":"direct|mailbox" } }
```

Rules of the road: messages cap at 256KB — put big content (images, media) in
`action:publish` and send the `keets://` url in the message; sender identity is
cryptographically verified before a message reaches the inbox; `mailbox` delivery
means stored-until-they-come-online (up to 30 days).

Transport spec: `keets/SERVICES.md` in the keets repo
(https://github.com/eurobuddha/keets).
