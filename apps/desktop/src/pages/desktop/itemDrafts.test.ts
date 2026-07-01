import assert from "node:assert/strict";
import {
  appendExtraDraftField,
  buildDefaultDraftFields,
  flattenAttachmentDraftBlocks,
  getAddMoreMenuItems,
  isCardContactDraftField,
  isUserEditableDraftField,
  makeAttachmentDraftBlock,
  makeDraftField,
  makeDraftGroupField,
  normalizeDraftFieldsForSave,
  reorderDraftFieldsByDrop,
  toggleDraftGroupCollapsed,
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
    "fields.group": "group",
    "fields.date": "date",
    "editor.cardIssuer": "issuer",
    "editor.cardPhoneLocal": "local phone",
    "editor.cardPhoneTollFree": "toll-free phone",
    "editor.cardPhoneInternational": "international phone",
    "editor.cardWebsite": "website",
    "editor.addTotp": "one-time password",
    "editor.addGroup": "group",
    "editor.addPassword": "password",
    "editor.addDate": "date",
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
assert.equal(isUserEditableDraftField(cardFields[5]), true);
assert.equal(isUserEditableDraftField(cardFields[0]), false);
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
  makeDraftGroupField(t),
  makeDraftGroupField(t),
  makeDraftField(t, "password", "password-one", true),
  makeDraftField(t, "password", "password-two", true),
  makeDraftField(t, "date", "2026-07-01", false),
  makeDraftField(t, "date", "2026-07-02", false),
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
assert.equal(
  normalizedRepeatedAddMoreFields.filter(
    (field) => field.kind === "group" && (field.children?.length ?? 0) > 0,
  ).length,
  2,
);
assert.equal(
  normalizedRepeatedAddMoreFields.filter((field) => field.kind === "password").length,
  3,
);
assert.equal(
  normalizedRepeatedAddMoreFields.filter((field) => field.kind === "date").length,
  2,
);

let repeatedExtraFields = loginFields;
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "totp");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "totp");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "note");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "note");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "group");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "group");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "password");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "password");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "date");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "date");

assert.equal(repeatedExtraFields.filter((field) => field.kind === "totp").length, 2);
assert.equal(repeatedExtraFields.filter((field) => field.kind === "note").length, 2);
assert.equal(
  repeatedExtraFields.filter(
    (field) => field.kind === "group" && (field.children?.length ?? 0) > 0,
  ).length,
  2,
);
assert.equal(repeatedExtraFields.filter((field) => field.kind === "password").length, 3);
assert.equal(repeatedExtraFields.filter((field) => field.kind === "date").length, 2);
assert.equal(
  repeatedExtraFields.every(
    (field) => field.kind !== "date" || /^\d{4}-\d{2}-\d{2}$/.test(field.value),
  ),
  true,
);

const editableExtraField = repeatedExtraFields.find((field) =>
  field.id.startsWith("optional-field-password-"),
);
assert.ok(editableExtraField);
editableExtraField.label = "admin password";
assert.equal(isUserEditableDraftField(editableExtraField), true);
assert.equal(isUserEditableDraftField(loginFields[2]), false);
assert.equal(
  normalizeDraftFieldsForSave(repeatedExtraFields).find(
    (field) => field.id === editableExtraField.id,
  )?.label,
  "admin password",
);

const draggedExtraField = repeatedExtraFields.find((field) =>
  field.id.startsWith("optional-field-date-"),
);
const targetExtraField = repeatedExtraFields.find((field) =>
  field.id.startsWith("optional-field-note-"),
);
assert.ok(draggedExtraField);
assert.ok(targetExtraField);

const dropReorderedFields = reorderDraftFieldsByDrop(
  repeatedExtraFields,
  draggedExtraField.id,
  targetExtraField.id,
  "before",
);
assert.equal(
  dropReorderedFields.findIndex((field) => field.id === draggedExtraField.id),
  dropReorderedFields.findIndex((field) => field.id === targetExtraField.id) - 1,
);
assert.equal(dropReorderedFields.length, repeatedExtraFields.length);
assert.deepEqual(
  reorderDraftFieldsByDrop(
    repeatedExtraFields,
    draggedExtraField.id,
    draggedExtraField.id,
    "before",
  ).map((field) => field.id),
  repeatedExtraFields.map((field) => field.id),
);

const firstWebsiteField = withSecondWebsite[0];
const secondWebsiteField = withSecondWebsite[3];
assert.deepEqual(
  reorderDraftFieldsByDrop(
    withSecondWebsite,
    firstWebsiteField.id,
    secondWebsiteField.id,
    "after",
  ).map((field) => field.id),
  [
    loginFields[1].id,
    loginFields[2].id,
    secondWebsiteField.id,
    firstWebsiteField.id,
  ],
);

const firstGroupField = repeatedExtraFields.find((field) =>
  field.id.startsWith("optional-field-group-"),
);
assert.ok(firstGroupField);
assert.equal(firstGroupField.kind, "group");
assert.equal(firstGroupField.value, "");
assert.equal(firstGroupField.collapsed, false);
assert.equal(firstGroupField.children?.length, 1);
assert.equal(firstGroupField.children?.[0]?.kind, "text");
assert.equal(isUserEditableDraftField(firstGroupField), true);

const collapsedGroupFields = toggleDraftGroupCollapsed(
  repeatedExtraFields,
  firstGroupField.id,
);
assert.equal(
  collapsedGroupFields.find((field) => field.id === firstGroupField.id)
    ?.collapsed,
  true,
);
assert.equal(
  normalizeDraftFieldsForSave(collapsedGroupFields).find(
    (field) => field.id === firstGroupField.id,
  )?.collapsed,
  undefined,
);

const movedGroupFields = reorderDraftFieldsByDrop(
  repeatedExtraFields,
  firstGroupField.id,
  loginFields[0].id,
  "before",
);
assert.equal(movedGroupFields[0]?.id, firstGroupField.id);

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
  ["group", "password", "date", "totp", "attachment", "note"],
);
assert.deepEqual(
  getAddMoreMenuItems(t, "payment-card").map((item) => item.kind),
  ["group", "password", "date", "totp", "attachment", "note"],
);
assert.deepEqual(
  getAddMoreMenuItems(t, "secure-note").map((item) => item.kind),
  ["group", "password", "date", "totp", "attachment", "note"],
);

console.log("itemDrafts tests passed");
