import assert from "node:assert/strict";
import {
  appendExtraDraftField,
  buildDefaultDraftFields,
  flattenAttachmentDraftBlocks,
  getAddMoreMenuItems,
  isAttachmentDraftField,
  isUserEditableDraftField,
  makeAttachmentDraftField,
  makeAttachmentDraftBlock,
  makeDraftField,
  makeExtraWebsiteDraftField,
  makeDraftGroupField,
  normalizeDraftFieldsForSave,
  appendDraftGroupChildField,
  removeDraftGroupChildField,
  reorderDraftGroupChildrenByDrop,
  reorderDraftFieldsByDrop,
  replaceDraftFieldSubset,
  toggleDraftGroupCollapsed,
  updateDraftFieldValueById,
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
    "fields.attachment": "attachments",
    "fields.totp": "one-time password",
    "fields.text": "text",
    "fields.phone": "phone",
    "fields.group": "group",
    "fields.date": "date",
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
  ["cardholder", "card number", "expiry", "CVC", "secret"],
);

assert.equal(isUserEditableDraftField(cardFields[0]), false);
assert.equal(
  cardFields.some((field) => field.label === "issuer"),
  false,
  "payment cards should not create the contact information block by default",
);
assert.equal(
  cardFields.some((field) => field.kind === "phone"),
  false,
  "payment cards should let users add contact fields through Add more instead",
);

const loginFields = buildDefaultDraftFields(t, "login");
const withSecondWebsite = [
  ...loginFields,
  { ...loginFields[0], id: "field-extra-site", value: "https://example.org" },
];

assert.equal(
  normalizeDraftFieldsForSave(withSecondWebsite).filter(
    (field) => field.kind === "url",
  ).length,
  2,
);

const extraWebsiteField = makeExtraWebsiteDraftField(t);
assert.equal(
  isUserEditableDraftField(extraWebsiteField),
  true,
  "website fields added by the user should be draggable and removable",
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
  normalizedRepeatedAddMoreFields.filter((field) => field.kind === "totp")
    .length,
  2,
);
assert.equal(
  normalizedRepeatedAddMoreFields.filter((field) => field.kind === "note")
    .length,
  2,
);
assert.equal(
  normalizedRepeatedAddMoreFields.filter(
    (field) => field.kind === "group" && (field.children?.length ?? 0) > 0,
  ).length,
  2,
);
assert.equal(
  normalizedRepeatedAddMoreFields.filter((field) => field.kind === "password")
    .length,
  3,
);
assert.equal(
  normalizedRepeatedAddMoreFields.filter((field) => field.kind === "date")
    .length,
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
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "text");
repeatedExtraFields = appendExtraDraftField(t, repeatedExtraFields, "phone");

assert.equal(
  repeatedExtraFields.filter((field) => field.kind === "totp").length,
  2,
);
assert.equal(
  repeatedExtraFields.filter((field) => field.kind === "note").length,
  2,
);
assert.equal(
  repeatedExtraFields.filter(
    (field) => field.kind === "group" && (field.children?.length ?? 0) > 0,
  ).length,
  2,
);
assert.equal(
  repeatedExtraFields.filter((field) => field.kind === "password").length,
  3,
);
assert.equal(
  repeatedExtraFields.filter((field) => field.kind === "date").length,
  2,
);
assert.equal(
  repeatedExtraFields.every(
    (field) => field.kind !== "date" || /^\d{4}-\d{2}-\d{2}$/.test(field.value),
  ),
  true,
);
assert.deepEqual(
  repeatedExtraFields.slice(-6).map((field) => field.kind),
  ["password", "password", "date", "date", "text", "phone"],
  "new fields should be appended after existing fields in the order the user adds them",
);

let secureNoteExtraFields = buildDefaultDraftFields(t, "secure-note");
secureNoteExtraFields = appendExtraDraftField(t, secureNoteExtraFields, "note");
secureNoteExtraFields = appendExtraDraftField(t, secureNoteExtraFields, "date");
secureNoteExtraFields = appendExtraDraftField(
  t,
  secureNoteExtraFields,
  "password",
);
assert.deepEqual(
  secureNoteExtraFields.map((field) => field.kind),
  ["note", "date", "password"],
  "secure note user-added fields should render after the existing note body and keep append order",
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
  dropReorderedFields.findIndex((field) => field.id === targetExtraField.id) -
    1,
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

const groupWithChildren = appendDraftGroupChildField(
  t,
  appendDraftGroupChildField(
    t,
    [firstGroupField],
    firstGroupField.id,
    "password",
  ),
  firstGroupField.id,
  "date",
);
const expandedGroup = groupWithChildren[0];
assert.equal(expandedGroup?.children?.length, 3);
assert.equal(expandedGroup?.children?.[1]?.kind, "password");
assert.equal(expandedGroup?.children?.[2]?.kind, "date");

const reorderedGroupChildren = reorderDraftGroupChildrenByDrop(
  groupWithChildren,
  firstGroupField.id,
  expandedGroup.children?.[2]?.id ?? "",
  expandedGroup.children?.[0]?.id ?? "",
  "before",
);
assert.deepEqual(
  reorderedGroupChildren[0]?.children?.map((child) => child.kind),
  ["date", "text", "password"],
);

const removedGroupChild = removeDraftGroupChildField(
  reorderedGroupChildren,
  firstGroupField.id,
  reorderedGroupChildren[0]?.children?.[1]?.id ?? "",
);
assert.deepEqual(
  removedGroupChild[0]?.children?.map((child) => child.kind),
  ["date", "password"],
);

const generatedGroupPasswordId =
  groupWithChildren[0]?.children?.find((child) => child.kind === "password")
    ?.id ?? "";
const groupPasswordUpdated = updateDraftFieldValueById(
  groupWithChildren,
  generatedGroupPasswordId,
  "generated-password",
);
assert.equal(
  groupPasswordUpdated[0]?.children?.find(
    (child) => child.id === generatedGroupPasswordId,
  )?.value,
  "generated-password",
);

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
  makeAttachmentDraftBlock("block-one", [attachmentOne]),
  makeAttachmentDraftBlock(),
  makeAttachmentDraftBlock("block-two", [attachmentTwo]),
];

assert.equal(attachmentBlocks.length, 3);
assert.deepEqual(flattenAttachmentDraftBlocks(attachmentBlocks), [
  attachmentOne,
  attachmentTwo,
]);

const attachmentFieldOne = makeAttachmentDraftField(t, attachmentBlocks[0].id);
const attachmentFieldTwo = makeAttachmentDraftField(t, attachmentBlocks[2].id);
attachmentFieldOne.label = "Files for onboarding";

assert.equal(attachmentFieldOne.kind, "attachment");
assert.equal(attachmentFieldOne.value, attachmentBlocks[0].id);
assert.equal(isAttachmentDraftField(attachmentFieldOne), true);
assert.equal(isUserEditableDraftField(attachmentFieldOne), true);
assert.equal(
  normalizeDraftFieldsForSave([attachmentFieldOne], attachmentBlocks)[0]?.label,
  "Files for onboarding",
);
assert.deepEqual(
  reorderDraftFieldsByDrop(
    [loginFields[1], attachmentFieldOne, attachmentFieldTwo],
    attachmentFieldTwo.id,
    loginFields[1].id,
    "before",
  ).map((field) => field.id),
  [attachmentFieldTwo.id, loginFields[1].id, attachmentFieldOne.id],
);

const mixedDraftFields = [
  loginFields[0],
  loginFields[1],
  loginFields[2],
  attachmentFieldOne,
  attachmentFieldTwo,
];
assert.deepEqual(
  replaceDraftFieldSubset(
    mixedDraftFields,
    (field) => field.kind === "url",
    [loginFields[0]],
  ).map((field) => field.id),
  mixedDraftFields.map((field) => field.id),
  "replacing a one-item subset should keep the full field order unchanged",
);
assert.deepEqual(
  replaceDraftFieldSubset(
    mixedDraftFields,
    (field) => field.kind === "attachment",
    [attachmentFieldTwo, attachmentFieldOne],
  ).map((field) => field.id),
  [
    loginFields[0].id,
    loginFields[1].id,
    loginFields[2].id,
    attachmentFieldTwo.id,
    attachmentFieldOne.id,
  ],
  "reordering a filtered subset should preserve all unrelated fields",
);

assert.deepEqual(
  getAddMoreMenuItems(t, "login").map((item) => item.kind),
  ["group", "text", "phone", "password", "date", "totp", "attachment", "note"],
);
assert.deepEqual(
  getAddMoreMenuItems(t, "payment-card").map((item) => item.kind),
  ["group", "text", "phone", "password", "date", "totp", "attachment", "note"],
);
assert.deepEqual(
  getAddMoreMenuItems(t, "secure-note").map((item) => item.kind),
  ["group", "text", "phone", "password", "date", "totp", "attachment", "note"],
);

console.log("itemDrafts tests passed");
