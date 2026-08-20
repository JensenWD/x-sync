# X Bookmark Sync extension

Chrome Manifest V3 extension that opens X's normal Bookmarks page in the logged-in Chrome profile, captures only the bookmark timeline responses produced by that page, and sends those pages over Tailnet HTTPS to the private X Bookmarks dashboard. X cookies never leave Chrome.

## Load or update

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension` directory, or press **Reload** on the existing extension after source updates.
4. Make sure Chrome is logged into `x.com` and both Chrome and AgentMac are connected to Tailscale.

The normal button uses automatic mode: bounded incremental syncs with a periodic full reconciliation. Select **Full reconcile** to deliberately scroll through the complete X bookmark timeline and archive bookmarks no longer saved on X. A temporary background X tab is closed after a successful run and left open when X needs attention.

The extension reports new, existing, archived, and page counts from the durable server-side run. It does not claim an already-running sync succeeded. Page uploads are idempotent, and interrupted full runs never archive unseen bookmarks.
