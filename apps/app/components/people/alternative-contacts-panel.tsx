"use client";

import type { AlternativeContactSnapshot } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, useTransition } from "react";
import {
  addAlternativeContactAction,
  deleteAlternativeContactAction,
  reorderAlternativeContactsAction,
  updateAlternativeContactAction,
} from "@/app/(authenticated)/people/_actions";

interface AlternativeContactsPanelProps {
  canManage: boolean;
  contacts: AlternativeContactSnapshot[];
  organisationId: string;
  personId: string;
}

interface ContactFormState {
  email: string;
  name: string;
  notes: string;
  phone: string;
  role: string;
}

const emptyForm: ContactFormState = {
  email: "",
  name: "",
  notes: "",
  phone: "",
  role: "",
};

export function AlternativeContactsPanel({
  canManage,
  contacts,
  organisationId,
  personId,
}: AlternativeContactsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<AlternativeContactSnapshot | null>(null);
  const [announceMessage, setAnnounceMessage] = useState<string | null>(null);

  const startAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  };

  const startEdit = (contact: AlternativeContactSnapshot) => {
    setEditingId(contact.id);
    setForm({
      email: contact.email ?? "",
      name: contact.name,
      notes: contact.notes ?? "",
      phone: contact.phone ?? "",
      role: contact.role ?? "",
    });
    setError(null);
    setFormOpen(true);
  };

  const submit = () => {
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!(form.email.trim() || form.phone.trim())) {
      setError("Add an email address or phone number.");
      return;
    }
    startTransition(async () => {
      const result = editingId
        ? await updateAlternativeContactAction({
            contactId: editingId,
            organisationId,
            patch: form,
          })
        : await addAlternativeContactAction({
            ...form,
            organisationId,
            personId,
          });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setForm(emptyForm);
      setEditingId(null);
      setFormOpen(false);
    });
  };

  const deleteContact = (contact: AlternativeContactSnapshot) => {
    startTransition(async () => {
      const result = await deleteAlternativeContactAction({
        contactId: contact.id,
        organisationId,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDeleteTarget(null);
    });
  };

  const moveContact = (
    contact: AlternativeContactSnapshot,
    direction: "up" | "down"
  ) => {
    if (isPending) {
      return;
    }
    const currentIds = contacts.map((c) => c.id);
    const index = currentIds.indexOf(contact.id);
    if (index === -1) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentIds.length) {
      return;
    }

    const newIds = [...currentIds];
    const [movedId] = newIds.splice(index, 1);
    if (movedId) {
      newIds.splice(targetIndex, 0, movedId);
    }

    setDraggedId(null);
    setError(null);
    setAnnounceMessage(null);

    startTransition(async () => {
      const result = await reorderAlternativeContactsAction({
        orderedContactIds: newIds,
        organisationId,
        personId,
      });
      if (result.ok) {
        const newPos = newIds.indexOf(contact.id) + 1;
        setAnnounceMessage(`${contact.name} moved to position ${newPos}`);
      } else {
        setError(result.error.message);
        setAnnounceMessage("Order was not changed");
      }
    });
  };

  const persistDrop = (targetId: string) => {
    if (isPending || !draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const ids = contacts.map((contact) => contact.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) {
      setDraggedId(null);
      return;
    }
    const movedContact = contacts.find((c) => c.id === draggedId);
    ids.splice(to, 0, ids.splice(from, 1)[0] ?? draggedId);
    setDraggedId(null);
    setError(null);
    setAnnounceMessage(null);

    startTransition(async () => {
      const result = await reorderAlternativeContactsAction({
        orderedContactIds: ids,
        organisationId,
        personId,
      });
      if (!result.ok) {
        setError(result.error.message);
        setAnnounceMessage("Order was not changed");
      } else if (movedContact) {
        const newPos = ids.indexOf(draggedId) + 1;
        setAnnounceMessage(`${movedContact.name} moved to position ${newPos}`);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="sr-only" role="status">
        {announceMessage}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground text-title-sm">
            Alternative contacts
          </h3>
          <p className="text-body-sm text-muted-foreground">
            People to contact when this person is unavailable.
          </p>
        </div>
        {canManage ? (
          <Button onClick={startAdd} size="sm" type="button">
            <PlusIcon className="mr-2 size-4" />
            Add contact
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl bg-destructive/10 p-3 text-destructive text-label-lg">
          {error}
        </div>
      ) : null}

      {formOpen && canManage ? (
        <div className="rounded-2xl bg-surface-container-high p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                value={form.name}
              />
            </Field>
            <Field label="Role">
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
                value={form.role}
              />
            </Field>
            <Field label="Email">
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                type="email"
                value={form.email}
              />
            </Field>
            <Field label="Phone">
              <Input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                value={form.phone}
              />
            </Field>
            <Field className="md:col-span-2" label="Notes">
              <Textarea
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                value={form.notes}
              />
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              disabled={isPending}
              onClick={submit}
              size="sm"
              type="button"
            >
              {editingId ? "Save changes" : "Add contact"}
            </Button>
            <Button
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
                setError(null);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <div className="rounded-2xl bg-surface-container-high p-6 text-label-lg text-muted-foreground">
          No alternative contacts.
          {canManage ? (
            <button
              className="ml-2 font-medium text-primary"
              onClick={startAdd}
              type="button"
            >
              Add contact
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This row renders drag-and-drop reordering, inline actions and a delete confirmation together; the explicit conditional rendering added by noLeakedRender pushed it just over the threshold. */}
          {contacts.map((contact, index) => (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: HTML drag/drop needs a stable drop target around the contact row.
            <li
              className="rounded-2xl bg-surface-container-high p-4"
              draggable={canManage && !isPending}
              key={contact.id}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDraggedId(contact.id)}
              onDrop={() => persistDrop(contact.id)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setDraggedId(null);
                }
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {canManage ? (
                      <GripVerticalIcon className="size-4 text-muted-foreground" />
                    ) : null}
                    <p className="font-medium text-body-sm">{contact.name}</p>
                  </div>
                  {contact.role ? (
                    <p className="text-label-md text-muted-foreground">
                      {contact.role}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-label-md text-muted-foreground">
                    {contact.email ? <span>{contact.email}</span> : null}
                    {contact.phone ? <span>{contact.phone}</span> : null}
                  </div>
                  {contact.notes ? (
                    <p className="mt-2 text-body-sm text-muted-foreground">
                      {contact.notes}
                    </p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      aria-label={`Move ${contact.name} up`}
                      disabled={index === 0 || isPending}
                      onClick={() => moveContact(contact, "up")}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowUpIcon className="size-4" />
                    </Button>
                    <Button
                      aria-label={`Move ${contact.name} down`}
                      disabled={index === contacts.length - 1 || isPending}
                      onClick={() => moveContact(contact, "down")}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowDownIcon className="size-4" />
                    </Button>
                    <Button
                      aria-label={`Edit ${contact.name}`}
                      disabled={isPending}
                      onClick={() => startEdit(contact)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button
                      aria-label={`Delete ${contact.name}`}
                      disabled={isPending}
                      onClick={() => setDeleteTarget(contact)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              {deleteTarget?.id === contact.id && (
                <div className="mt-3 rounded-2xl bg-destructive/10 p-3 text-label-lg">
                  <p className="text-destructive">
                    Delete {contact.name}? This cannot be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      disabled={isPending}
                      onClick={() => deleteContact(contact)}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Delete
                    </Button>
                    <Button
                      onClick={() => setDeleteTarget(null)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 block text-label-md text-muted-foreground uppercase tracking-wider">
        {label}
      </Label>
      {children}
    </div>
  );
}
