import assert from "node:assert/strict";
import {
  appendExtraDraftField,
  buildDefaultDraftFields,
  flattenAttachmentDraftBlocks,
  getAddMoreMenuItems,
  isCardContactDraftField,
  makeAttachmentDraftBlock,
  makeDraftField,
  normalizeDraftFieldsForSave,
} from "./itemDrafts";

const t = (key: string) =>
  ({
    "fields.username": "account",
    "fields.password": "password",
    "fields.url": "website",
    "fields.cardholder": "cardholder",
    "fields.cardNumber": "card number",
    "fields.expiry": "expiry",
    "fields.cvv": "CVC",
    "fields.secret": "secret",
    "fields.note": "note",
    "fields.totp": "one-time password",
    "fields.text": "text",
    "fields.phone": "phone",
    "editor.cardIssuer": "issuer",
    "editor.cardPhoneLocal": "local phone",
    "editor.cardPhoneTollFree": "toll-free phone",
    "editor.cardPhoneInternational": "international phone",
    "editor.cardWebsite": "website",
    "editor.addTotp": "one-time password",
    "detail.attachments": "attachments",
    "editor.notes": "note",
  })[key] ?? key;

const cardFields = buildDefaultDraftFields(t, "payment-card");

assert.deepEqual(
  cardFields.map((field) => field.label),
  [
    "cardholder",
    "card number",
    "expiry",
    "CVC",
    "secret",
    "issuer",
    "local phone",
    "toll-free phone",
    "international phone",
    "website",
  ],
);

assert.equal(cardFields.filter(isCardContactDraftField).length, 5);
assert.equal(
  isCardContactDraftField({
    id: "custom-contact",
    kind: "text",
    label: "renamed contact field",
    value: "",
    sensitive: false,
  }),
  true,
);
assert.equal(
  isCardContactDraftField({
    id: "sensitive-secret",
    kind: "secret",
    label: "secret",
    value: "",
    sensitive: true,
  }),
  false,
);

const removedIssuer = cardFields.filter((field) => field.label !== "issuer");
const normalized = normalizeDraftFieldsForSave(removedIssuer);

assert.equal(
  normalized.some((field) => field.label === "issuer"),
  false,
);
assert.equal(
  normalized.some((field) => field.label === "website" && field.kind === "text"),
  true,
);

const loginFields = buildDefaultDraftFields(t, "login");
const withSecondWebsite = [
  ...loginFields,
  { ...loginFields[0], id: "field-extra-site", value: "https://example.org" },
];

assert.equal(
  normalizeDraftFieldsForSave(withSecondWebsite).filter((field) => field.kind === "url").length,
  2,
);

const withRepeatedAddMoreFields = [
  ...loginFields,
  makeDraftField(t, "totp", "totp-one", true),
  makeDraftField(t, "totp", "totp-two", true),
  makeDraftField(t, "note", "note-one", false),
  makeDraftField(t, "note", "note-two", false),
];
const normalizedRepeatedAddMoreFields = normalizeDraftFieldsForSave(
  withRepeatedAddMoreFields,
);

assert.equal(
  normalizedRepeatedAddMoreFields.filter((field) => field.kind === "totp").length,
  2,
);
assert.equal(
  normalizedRepeatedAddMoreFields.filter((field) => field.kind === "note").length,
  2,
);

let repeatedExtraFields = loginFields;
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "totp");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "totp");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "note");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "note");

assert.equal(repeatedExtraFields.filter((field) => field.kind === "totp").length, 2);
assert.equal(repeatedExtraFields.filter((field) => field.kind === "note").length, 2);

const attachmentOne = {
  id: "attachment-one",
  fileName: "one.txt",
  mimeType: "text/plain",
  sizeBytes: 12,
  checksumSha256: "sha-one",
  encryptedBlobRef: "blob-one",
  state: "pending-upload" as const,
};
const attachmentTwo = {
  id: "attachment-two",
  fileName: "two.txt",
  mimeType: "text/plain",
  sizeBytes: 24,
  checksumSha256: "sha-two",
  encryptedBlobRef: "blob-two",
  state: "pending-upload" as const,
};
const attachmentBlocks = [
  makeAttachmentDraftBlock([attachmentOne]),
  makeAttachmentDraftBlock(),
  makeAttachmentDraftBlock([attachmentTwo]),
];

assert.equal(attachmentBlocks.length, 3);
assert.deepEqual(flattenAttachmentDraftBlocks(attachmentBlocks), [
  attachmentOne,
  attachmentTwo,
]);

assert.deepEqual(
  getAddMoreMenuItems(t, "login").map((item) => item.kind),
  ["totp", "attachment", "note"],
);
assert.deepEqual(
  getAddMoreMenuItems(t, "payment-card").map((item) => item.kind),
  ["attachment", "note"],
);
assert.deepEqual(
  getAddMoreMenuItems(t, "secure-note").map((item) => item.kind),
  ["attachment", "note"],
);

console.log("itemDrafts tests passed");
