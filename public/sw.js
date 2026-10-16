/* Paradise Blox admin alerts. Shows a notification when the server sends one, and opens the order when tapped. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "Paradise Blox", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Paradise Blox";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: "/pb-icon-192.png",
    badge: "/pb-icon-192.png",
    data: { url: data.url || "/admin" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/admin", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      if (client.url.includes("/admin")) {
        await client.focus();
        if ("navigate" in client) return client.navigate(url);
        return;
      }
    }
    return self.clients.openWindow(url);
  })());
});
