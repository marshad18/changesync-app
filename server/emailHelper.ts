/**
 * Email helper for ChangeSync approver notifications.
 *
 * Strategy:
 *  1. If SMTP credentials are configured (SMTP_HOST / SMTP_USER / SMTP_PASS), use nodemailer.
 *  2. Otherwise fall back to the Manus forge notification service (notifies the owner)
 *     and log the email content so it is not silently lost.
 *
 * For production, set the following environment variables:
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   e.g. 587
 *   SMTP_USER   e.g. changesync@yourcompany.com
 *   SMTP_PASS   App password / SMTP password
 *   SMTP_FROM   e.g. "ChangeSync <changesync@yourcompany.com>"
 */
import nodemailer from "nodemailer";
import { notifyOwner } from "./_core/notification";

export interface ApproverEmailPayload {
  to: string;
  approverName?: string;
  changeEventTitle: string;
  documentName: string;
  changedFields: Array<{ fieldName: string; oldValue: string; newValue: string }>;
  approvalLink: string;
  rejectionLink: string;
}

function buildHtml(p: ApproverEmailPayload): string {
  const rows = p.changedFields.map(f => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151">${f.fieldName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#dc2626;text-decoration:line-through">${f.oldValue}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#16a34a;font-weight:600">${f.newValue}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:28px 32px">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.6);text-transform:uppercase">ChangeSync</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff">Document Approval Required</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 16px;color:#374151;font-size:15px">
              Hi${p.approverName ? ` ${p.approverName}` : ""},
            </p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6">
              A change has been submitted for <strong style="color:#111827">${p.changeEventTitle}</strong> and requires your approval. 
              The document <strong style="color:#111827">${p.documentName}</strong> has been updated with the following changes:
            </p>
            <!-- Changes table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px">
              <thead>
                <tr style="background:#f3f4f6">
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Field</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Old Value</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">New Value</th>
                </tr>
              </thead>
              <tbody>${rows || '<tr><td colspan="3" style="padding:12px;color:#9ca3af;text-align:center">See document for full change details</td></tr>'}</tbody>
            </table>
            <p style="margin:0 0 8px;color:#6b7280;font-size:13px">Please review the modified document and take action:</p>
            <!-- CTA Buttons -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td style="padding-right:12px">
                  <a href="${p.approvalLink}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
                    ✓ Approve
                  </a>
                </td>
                <td>
                  <a href="${p.rejectionLink}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
                    ✗ Reject
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5">
              Or view the full document comparison at:<br>
              <a href="${p.approvalLink}" style="color:#2563eb">${p.approvalLink}</a>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#9ca3af;font-size:12px">
              This email was sent by ChangeSync — AI-Powered Engineering Change Management.<br>
              This link expires in 7 days.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText(p: ApproverEmailPayload): string {
  const changes = p.changedFields.map(f => `  • ${f.fieldName}: ${f.oldValue} → ${f.newValue}`).join("\n");
  return `Hi${p.approverName ? ` ${p.approverName}` : ""},

A change has been submitted for "${p.changeEventTitle}" and requires your approval.
Document: ${p.documentName}

Changes:
${changes || "  See document for full change details"}

APPROVE: ${p.approvalLink}
REJECT:  ${p.rejectionLink}

This link expires in 7 days.
— ChangeSync`;
}

export async function sendApproverEmail(payload: ApproverEmailPayload): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser ?? "ChangeSync <noreply@changesync.app>";

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: payload.to,
        subject: `[ChangeSync] Approval Required: ${payload.changeEventTitle} — ${payload.documentName}`,
        text: buildText(payload),
        html: buildHtml(payload),
      });

      console.log(`[Email] Approval email sent to ${payload.to}`);
      return true;
    } catch (err) {
      console.error("[Email] Failed to send via SMTP:", err);
      // Fall through to notification fallback
    }
  }

  // Fallback: notify owner with the email content (no SMTP configured)
  console.log(`[Email] No SMTP configured — logging approval email for ${payload.to}`);
  console.log(`[Email] Approval link: ${payload.approvalLink}`);
  console.log(`[Email] Rejection link: ${payload.rejectionLink}`);

  try {
    await notifyOwner({
      title: `[ChangeSync] Approval email queued for ${payload.to}`,
      content: `An approval email was requested for ${payload.to} but no SMTP is configured.\n\nApproval link: ${payload.approvalLink}\nRejection link: ${payload.rejectionLink}\n\nChange: ${payload.changeEventTitle}\nDocument: ${payload.documentName}`,
    });
  } catch {
    // Ignore notification errors
  }

  return false; // Indicates email was not actually sent
}
