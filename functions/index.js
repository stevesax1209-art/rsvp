const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');

// The API key is stored securely in Google Cloud Secret Manager.
// Set it once with:  firebase functions:secrets:set MAILERLITE_API_KEY
const mailerLiteApiKey = defineSecret('MAILERLITE_API_KEY');

// Optional: map each event value to a MailerLite group ID for segmentation.
// Keys must match the <option value="..."> strings in public/index.html.
// Fill in your group IDs from the MailerLite dashboard (Subscribers → Groups).
const EVENT_GROUP_IDS = {
  'Cleveland - April 18': '180251083036166100',
  'Phoenix - May 25': '180251214422737963',
  'Collingwood - June 7': '180251239077906214',
  'Baton Rouge - July 25': '180251255757604767',
};

exports.rsvp = onRequest({ secrets: [mailerLiteApiKey], invoker: "public" }, async (req, res) => {
    // Allow requests from the hosting origin
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { email, firstName, lastName, event } = req.body;

    if (!email || !event) {
        res.status(400).json({ error: 'email and event are required' });
        return;
    }

    const payload = {
        email,
        fields: {
            name:       firstName || '',
            last_name:  lastName  || '',
            rsvp_event: event,
        },
    };

    const groupId = EVENT_GROUP_IDS[event];
    if (groupId) {
        payload.groups = [groupId];
    }

    const apiKey = mailerLiteApiKey.value().trim();
    if (!apiKey) {
        logger.error('MAILERLITE_API_KEY secret is not configured');
        res.status(500).json({ error: 'Server configuration error' });
        return;
    }

    try {
        const mlRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept':        'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await mlRes.json();
        res.status(mlRes.ok ? 200 : mlRes.status).json(data);
    } catch (err) {
        logger.error('MailerLite API error', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
