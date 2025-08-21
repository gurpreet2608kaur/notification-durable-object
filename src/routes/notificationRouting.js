// src/routes/notificationRouting.js

import { Hono } from 'hono';

const app = new Hono();

app.post('/notification', async (c) => {
  try {
    // Log the raw request body for debugging
    const rawBody = await c.req.text();
    console.log('Raw request body:', rawBody);

    // Check if NOTIFICATION binding exists
    if (!c.env.NOTIFICATION) {
      console.log('Error: NOTIFICATION binding is undefined');
      return c.json({ error: 'Server configuration error', details: 'NOTIFICATION binding is not defined' }, 500);
    }

    const data = await c.req.json();
    if (!data) {
      return c.json({ error: 'Invalid or empty JSON body' }, 400);
    }

    const id = c.env.NOTIFICATION.idFromName('notification');
    const stub = c.env.NOTIFICATION.get(id);
    const result = await stub.storeNotification(data);
    return c.json(result);
  } catch (error) {
    console.log('Error in POST /notification:', error.message);
    return c.json({ error: 'Failed to process request', details: error.message }, 500);
  }
});

app.get('/notifications', async (c) => {
  const id = c.env.NOTIFICATION.idFromName('notification');
  const stub = c.env.NOTIFICATION.get(id);
  const notifications = await stub.getNotifications();
  return c.json(notifications);
});

export default app;