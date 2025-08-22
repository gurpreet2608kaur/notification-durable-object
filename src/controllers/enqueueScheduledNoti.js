// enqueueScheduledNoti.js


// Pure helper for DO + routes
export async function enqueueToQueue(env, data) {
  await env.QUEUE.send(data);
  console.log("✅ Enqueued notification:", data);
  return data;
}

// Hono controller
export const enqueue = async (c) => {
  try {
    const body = await c.req.json();
    await enqueueToQueue(c.env, body);

    return c.json({
      success: true,
      message: "scheduled notification enqueued",
      data: body,
    });
  } catch (error) {
    console.error("❌ Enqueue Error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
};

