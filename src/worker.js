import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';
import { enqueueToQueue } from "./controllers/enqueueScheduledNoti.js";

// ✅ Durable Object definition
export class MyDurableObject extends DurableObject {
  constructor(state, env) {
    super(state, env);
    console.log("🆕 Durable Object created");
  }

  async storeNotification(data) {
    console.log("📥 Incoming notification to store:", data);

    if (!data?.content?.schedule_time) {
      console.error("❌ Rejecting invalid notification (no schedule_time):", data);
      return (await this.ctx.storage.get('notifications')) || [];
    }

    let notifications = (await this.ctx.storage.get('notifications')) || [];
    console.log("📂 Current notifications in storage:", notifications);

    const exists = notifications.some(
      (n) =>
        n.company_id === data.company_id &&
        n.content?.schedule_time === data.content.schedule_time
    );

    if (!exists) {
      console.log("✅ New notification, storing:", data);
      notifications.push(data);
      await this.ctx.storage.put('notifications', notifications);
      console.log("💾 Notifications updated in storage:", notifications);
      await this.scheduleNextAlarm(notifications);
    } else {
      console.log("⚠️ Duplicate notification found, skipping store:", data);
    }

    return notifications;
  }

  async getNotifications() {
    console.log("📤 Fetching notifications from storage");
    return (await this.ctx.storage.get('notifications')) || [];
  }

  async scheduleNextAlarm(notifications) {
    console.log("🛠 Scheduling next alarm, total notifications:", notifications.length);

    if (!notifications?.length) {
      console.log("ℹ️ No notifications found to schedule");
      return;
    }

    const next = notifications.reduce((min, n) => {
      if (!n.content?.schedule_time) return min;
      return !min || new Date(n.content.schedule_time) < new Date(min.content.schedule_time)
        ? n
        : min;
    }, null);

    if (next?.content?.schedule_time) {
      const ts = new Date(next.content.schedule_time).getTime();
      console.log("⏰ Setting alarm for:", ts, new Date(ts).toISOString());
      await this.ctx.storage.setAlarm(ts);
    }
  }

  async alarm() {
    console.log("🔔 Alarm triggered at:", new Date().toISOString());

    let notifications = (await this.ctx.storage.get("notifications")) || [];
    console.log("📦 Notifications in storage at alarm time:", notifications);

    const now = Date.now();

    const due = notifications.filter(
      (n) => n.content?.schedule_time && new Date(n.content.schedule_time).getTime() <= now
    );
    const upcoming = notifications.filter(
      (n) => n.content?.schedule_time && new Date(n.content.schedule_time).getTime() > now
    );

    console.log(`⏳ Due: ${due.length}, 📅 Upcoming: ${upcoming.length}`);

    for (const n of due) {
      await enqueueToQueue(this.env, n);
      console.log("🚀 Enqueued scheduled notification:", n);
    }

    await this.ctx.storage.put("notifications", upcoming);
    console.log("💾 Storage updated with upcoming notifications:", upcoming);

    await this.scheduleNextAlarm(upcoming);
  }

  async fetch(request) {
    const url = new URL(request.url);
    console.log(`📡 DO Fetch called: ${url.pathname}, Method: ${request.method}`);

    if (url.pathname === "/store" && request.method === "POST") {
      try {
        const data = await request.json();
        console.log("📥 /store endpoint received:", data);

        const result = await this.storeNotification(data);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("❌ Error parsing JSON in /store:", err);
        return new Response("Invalid JSON", { status: 400 });
      }
    }

    if (url.pathname === "/list" && request.method === "GET") {
      console.log("📤 /list endpoint hit");
      const result = await this.getNotifications();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    console.warn("⚠️ Unknown path in DO fetch:", url.pathname);
    return new Response("Not found", { status: 404 });
  }
}

// ✅ Worker entry (Module Worker syntax)
const app = new Hono();

app.post('/notification', async (c) => {
  console.log("➡️ Worker: POST /notification called");

  const id = c.env.NOTIFICATION.idFromName('notification');
  const stub = c.env.NOTIFICATION.get(id);

  const data = await c.req.json();
  console.log("📨 Forwarding notification to DO /store:", data);

  const res = await stub.fetch('http://do/store', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  const json = await res.json();
  console.log("⬅️ Response from DO /store:", json);

  return c.json(json);
});

app.get('/notifications', async (c) => {
  console.log("➡️ Worker: GET /notifications called");

  const id = c.env.NOTIFICATION.idFromName('notification');
  const stub = c.env.NOTIFICATION.get(id);

  const res = await stub.fetch('http://do/list');
  const json = await res.json();

  console.log("⬅️ Response from DO /list:", json);

  return c.json(json);
});

// ✅ Required default export
export default app;
