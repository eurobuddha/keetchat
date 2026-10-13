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

**Inbox ownership (RPC mode):** exactly one client may drain a node's inbox. Don't run the RPC page against a node whose host app (desktop Chat tab, phone app) already drains `keets action:inbox` — they would steal messages from each other.
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

## Message wire schema (0.2.0+) — Parlons-compatible

Chat payloads are JSON with Parlons-native field names (`maxima_chat_v1` — see
ChatMessage.java in the maxima repo), hex-encoded into `datahex:`:

```json
{ "application":"maxima_chat_v1", "id":"kc-<ts>-<rand>", "body":"<text>",
  "name":"<sender display name>", "ref":"<optional keets:// media url>", "ts":<ms> }
```

- `ref` carries media: publish the file with `keets action:publish`, send the
  hash-pinned `keets://` url (messages cap at 256KB; media rides Hyperdrive).
- `id` is the cross-transport dedupe key; receivers fall back to the keets inbox id.
- Legacy plain-text payloads (0.1.0) are still accepted on receive.
- The same payload parses unchanged in Parlons native once parlons-node gains the
  keets transport; classic-Maxima contacts are reachable via Parlons' existing
  maxsolo bridge. Helper: `chatschema.js` (chatEncode/chatDecode).

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
