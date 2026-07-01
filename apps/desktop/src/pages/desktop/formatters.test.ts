import assert from "node:assert/strict";
import { fieldDisplayLabel, fieldLabel } from "./formatters";

const t = (key: string) =>
  ({
    "fields.username": "Username",
    "fields.password": "Password",
    "fields.url": "Website",
    "fields.totp": "One-time password",
    "fields.email": "Email",
    "fields.phone": "Phone",
    "fields.text": "Text",
    "fields.group": "Group",
    "fields.date": "Date",
    "fields.secret": "Secret",
    "fields.note": "Note",
    "fields.cardholder": "Cardholder",
    "fields.cardNumber": "Card number",
    "fields.expiry": "Expiry",
    "fields.cvv": "CVC",
    "fields.recoveryCode": "Recovery code",
  })[key] ?? key;

assert.equal(fieldLabel(t, "password"), "Password");
assert.equal(fieldLabel(t, "password", "Admin password"), "Admin password");
assert.equal(
  fieldDisplayLabel(t, {
    id: "field-custom",
    kind: "text",
    label: "Support phone",
    value: "123",
    sensitive: false,
  }),
  "Support phone",
);

console.log("formatters tests passed");
