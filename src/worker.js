// src/worker.js
import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';

export class MyDurableObject extends DurableObject {
  constructor(state, env) {
    super(state, env);
  }

  async storeNotification(data) {
    let notifications = (await this.ctx.storage.get('notifications')) || [];
    notifications.push(data);
    await this.ctx.storage.put('notifications', notifications);
    return notifications;
  }

  async getNotifications() {
    return (await this.ctx.storage.get('notifications')) || [];
  }
}

const app = new Hono();

app.post('/notification', async (c) => {
  try {
    // Check if binding exists first
    if (!c.env.NOTIFICATION) {
      console.log('Error: NOTIFICATION binding is undefined');
      console.log('Available env keys:', Object.keys(c.env || {}));
      return c.json({ 
        error: 'Server configuration error', 
        details: 'NOTIFICATION binding is not defined' 
      }, 500);
    }

    // Parse JSON directly - don't call c.req.text() first!
    let data;
    try {
      data = await c.req.json();
    } catch (parseError) {
      console.log('JSON parsing error:', parseError.message);
      return c.json({ 
        error: 'Failed to parse JSON', 
        details: parseError.message 
      }, 400);
    }

    if (!data) {
      return c.json({ error: 'Empty JSON body' }, 400);
    }

    console.log('Parsed data:', data);

    // Use the correct binding name from wrangler.jsonc
    const id = c.env.NOTIFICATION.idFromName('notification');
    const stub = c.env.NOTIFICATION.get(id);
    const result = await stub.storeNotification(data);
    return c.json(result);
  } catch (error) {
    console.log('Error in POST /notification:', error.message);
    console.log('Error stack:', error.stack);
    return c.json({ 
      error: 'Failed to process request', 
      details: error.message 
    }, 500);
  }
});

app.get('/notifications', async (c) => {
  try {
    if (!c.env.NOTIFICATION) {
      return c.json({ 
        error: 'Server configuration error', 
        details: 'NOTIFICATION binding is not defined' 
      }, 500);
    }

    const id = c.env.NOTIFICATION.idFromName('notification');
    const stub = c.env.NOTIFICATION.get(id);
    const notifications = await stub.getNotifications();

    console.log('Retrieved notifications:', notifications);
    return c.json(notifications);
  } catch (error) {
    console.log('Error in GET /notifications:', error.message);
    return c.json({ 
      error: 'Failed to get notifications', 
      details: error.message 
    }, 500);
  }
});

export default app;