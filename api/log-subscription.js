/**
 * api/log-subscription.js
 *
 * Endpoint called when the user grants notification permission on the client.
 * Logs the Web Push subscription object so Musa can easily retrieve and paste it
 * into the Vercel Global Config store under the key 'push-subscription'.
 */

export default async function handler(req, res) {
  // Set CORS headers for local/cross-origin development testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { subscription, focusSettings, reviews, userAgent } = req.body || {};

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription object: missing endpoint.' });
    }

    const subString = JSON.stringify(subscription);

    console.log('======================================================');
    console.log('🔔 [WEB PUSH SUBSCRIPTION RECEIVED]');
    console.log('User Agent:', userAgent || req.headers['user-agent']);
    console.log('Timestamp :', new Date().toISOString());
    console.log('------------------------------------------------------');
    console.log('Copy the JSON line below to paste into Vercel Global Config:');
    console.log('KEY: push-subscription');
    console.log('VALUE:');
    console.log(subString);
    console.log('======================================================');

    if (focusSettings) {
      console.log('📌 [FOCUS SETTINGS]');
      console.log('KEY: focus-settings');
      console.log('VALUE:');
      console.log(JSON.stringify(focusSettings));
      console.log('------------------------------------------------------');
    }

    if (reviews && Array.isArray(reviews)) {
      console.log('📌 [REVIEWS]');
      console.log('KEY: reviews');
      console.log('VALUE:');
      console.log(JSON.stringify(reviews));
      console.log('======================================================');
    }

    return res.status(200).json({
      success: true,
      message: 'Subscription logged successfully in Vercel Function logs.',
      subscriptionString: subString
    });
  } catch (err) {
    console.error('[log-subscription] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
