---
name: send-email
description: Send an email to a pet owner — appointment/follow-up reminders, visit receipts and treatment summaries, or diagnosis/medication instructions. Use whenever a visit's followUp is scheduled, a visit is closed, or the owner otherwise needs a written summary.
---

# Send Email

Sends an email to a pet owner on behalf of the clinic. Use this after key events in `../../brain/brain.md`'s workflows: intake confirmation, follow-up scheduling, or visit close-out.

## When to use

- A follow-up (`followUp.scheduled = true`) was just set on a visit — send a confirmation with the date and reason.
- A visit's `status` moves to `closed` — send a receipt/summary covering diagnosis, medications with instructions, and itemized costs.
- The owner asks for a copy of medication instructions or a treatment summary.

## Steps

1. Pull the relevant patient record from `../../memory/patients.json` for the owner's name and email, and the relevant visit from `../../memory/visits.json` for the content.
2. Draft the email:
   - **Reminder**: pet name, appointment date/time, reason, clinic contact info.
   - **Summary/receipt**: pet name, visit date, diagnosis, medications (name/dosage/frequency/instructions), itemized costs and total, next follow-up date if any.
3. If the owner's email is missing from the patient record, ask for it before proceeding — do not skip the send silently.
4. Send the email and confirm to the user that it was sent, including the recipient address.

## Notes

- Never include another owner's or patient's data in an email.
- Keep tone professional and concise; this is a clinic communication, not a marketing message.
