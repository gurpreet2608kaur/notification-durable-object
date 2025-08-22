// src/worker.js
import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';
import { enqueueToQueue } from "./controllers/enqueueScheduledNoti.js";


export class MyDurableObject extends DurableObject {
  constructor(state, env) {
    super(state, env);
  }

  async storeNotification(data) {
    let notifications = (await this.ctx.storage.get('notifications')) || [];
    notifications.push(data);
    await this.ctx.storage.put('notifications', notifications);
    await this.scheduleNextAlarm(notifications);
    return notifications;
  }

  async getNotifications() {
    return (await this.ctx.storage.get('notifications')) || [];
  }
  async scheduleNextAlarm(notifications) {
    if (!notifications || notifications.length === 0) return;
 console.log("🔍 Debug notifications:", JSON.stringify(notifications, null, 2));
    // Find earliest scheduled notification
  const next = notifications.reduce((min, n) => {
    console.log("🔍 Processing notification:", JSON.stringify(n, null, 2));
    console.log("🔍 n.content:", n.content);
    console.log("🔍 schedule_time:", n.content?.schedule_time);
    
    if (!n.content || !n.content.schedule_time) {
      console.error("❌ Invalid notification structure:", n);
      return min;
    }
    
    return !min || new Date(n.content.schedule_time) < new Date(min.content.schedule_time)
      ? n
      : min;
  }, null);

    if (next) {
      const ts = new Date(next.content.schedule_time).getTime();
      console.log("⏰ Setting alarm for:", ts, new Date(ts).toISOString());
      await this.ctx.storage.setAlarm(ts);
    }
  }

  async alarm() {
    let notifications = (await this.ctx.storage.get("notifications")) || [];
    const now = Date.now();

    const due = notifications.filter(
      (n) => new Date(n.content.schedule_time).getTime() <= now
    );
    const upcoming = notifications.filter(
      (n) => new Date(n.content.schedule_time).getTime() > now
    );

    // Enqueue all due notifications
    for (const n of due) {
      await enqueueToQueue(this.env, n);
      console.log("🚀 Enqueued scheduled notification:", n);
    }

    // Save remaining (future) notifications
    await this.ctx.storage.put("notifications", upcoming);

    // Schedule next alarm if needed
    await this.scheduleNextAlarm(upcoming);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/store" && request.method === "POST") {
      const text = await request.text(); // read raw body
      const data = JSON.parse(text);     // parse JSON
      const result = await this.storeNotification(data);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/list" && request.method === "GET") {
      const result = await this.getNotifications();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Not found", { status: 404 });
  }

}

const app = new Hono();

app.post('/notification', async (c) => {
  try {
    const id = c.env.NOTIFICATION.idFromName('notification');
    const stub = c.env.NOTIFICATION.get(id);

    const data = await c.req.json();
    const res = await stub.fetch('http://do/store', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    if (!res.ok) {
      console.error('DO response not ok:', res.status, await res.text());
      return c.json({ error: 'Internal error' }, 500);
    }
    
    return c.json(await res.json());
  } catch (error) {
    console.error('Error in /notification:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.get('/notifications', async (c) => {
  const id = c.env.NOTIFICATION.idFromName('notification');
  const stub = c.env.NOTIFICATION.get(id);

  const res = await stub.fetch('http://do/list');
  return c.json(await res.json());
});

export default app;