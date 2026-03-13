import { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { smtpHost, smtpPort, username, password, emailAddress, displayName } = req.body;

  if (!smtpHost || !smtpPort || !username || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Test SMTP connection by creating a transporter and verifying it
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: parseInt(smtpPort) === 465, // true for 465, false for 587
      auth: { user: username, pass: password },
      // Timeout after 10 seconds so we don't hang
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    await transporter.verify();

    return res.status(200).json({
      success: true,
      message: 'SMTP connection verified successfully',
    });
  } catch (error: any) {
    console.error('SMTP test failed:', error);

    // Return a helpful message based on the error type
    let message = 'Connection failed. Check your server details and credentials.';
    if (error.code === 'EAUTH')        message = 'Authentication failed. Check your username and password (or App Password).';
    if (error.code === 'ECONNREFUSED') message = 'Could not connect to the server. Check your SMTP host and port.';
    if (error.code === 'ETIMEDOUT')    message = 'Connection timed out. Check your SMTP host and port.';
    if (error.responseCode === 535)    message = 'Wrong credentials. For Gmail, make sure you are using an App Password, not your regular password.';

    return res.status(400).json({ success: false, message, code: error.code });
  }
}
