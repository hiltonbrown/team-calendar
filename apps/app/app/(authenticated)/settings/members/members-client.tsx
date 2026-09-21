"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { toast } from "@repo/design-system/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { MailIcon, UserMinusIcon, UserPlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { inviteMember } from "@/app/actions/settings/invite-member";
import { removeMember } from "@/app/actions/settings/remove-member";
import { updateMemberRole } from "@/app/actions/settings/update-member-role";
import { ConfirmActionDialog } from "../components/confirm-action-dialog";
import { RoleBadge } from "../components/role-badge";
import { SettingsSectionHeader } from "../components/settings-section-header";

type OrgRole = "org:owner" | "org:admin" | "org:manager" | "org:viewer";

interface Member {
  emailAddress: string;
  firstName: string | null;
  imageUrl: string;
  lastName: string | null;
  membershipId: string;
  role: string;
  userId: string;
}

interface PendingInvitation {
  createdAt: number;
  emailAddress: string;
  id: string;
  role: string;
}

interface MembersClientProps {
  currentUserId: string;
  currentUserRole: string;
  members: Member[];
  pendingInvitations: PendingInvitation[];
}

const ROLE_OPTIONS: { value: OrgRole; label: string }[] = [
  { label: "Admin", value: "org:admin" },
  { label: "Manager", value: "org:manager" },
  { label: "Viewer", value: "org:viewer" },
];

const getInitials = (
  firstName: string | null,
  lastName: string | null,
  email: string
) => {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName[0].toUpperCase();
  }
  return email[0].toUpperCase();
};

export const MembersClient = ({
  members,
  pendingInvitations,
  currentUserId,
  currentUserRole,
}: MembersClientProps) => {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("org:viewer");
  const [isPendingInvite, startInviteTransition] = useTransition();
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [isActionPending, startActionTransition] = useTransition();

  const isOwner = currentUserRole === "org:owner";

  const handleInvite = () => {
    if (!inviteEmail) {
      return;
    }
    startInviteTransition(async () => {
      const result = await inviteMember({
        emailAddress: inviteEmail,
        role: inviteRole,
      });
      if (result.ok) {
        toast.success(`Invitation sent to ${inviteEmail}`);
        setInviteEmail("");
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleRoleChange = (member: Member, role: OrgRole) => {
    setUpdatingMemberId(member.userId);
    startActionTransition(async () => {
      const result = await updateMemberRole({
        membershipId: member.userId,
        role,
      });
      setUpdatingMemberId(null);
      if (result.ok) {
        toast.success(
          `Updated ${member.firstName ?? member.emailAddress}'s role`
        );
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleRemoveConfirm = () => {
    if (!removeTarget) {
      return;
    }
    const target = removeTarget;
    setRemoveTarget(null);
    startActionTransition(async () => {
      const result = await removeMember({ userId: target.userId });
      if (result.ok) {
        toast.success(
          `${target.firstName ?? target.emailAddress} removed from organisation`
        );
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Manage who has access to your organisation and what they can do."
        title="Members"
      />

      {/* Invite section */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-title-md">Invite a member</CardTitle>
          <CardDescription>
            Send an email invitation to add someone to your organisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label className="sr-only" htmlFor="invite-email">
                Email address
              </Label>
              <Input
                id="invite-email"
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                placeholder="colleague@company.com"
                type="email"
                value={inviteEmail}
              />
            </div>
            <Select
              onValueChange={(v) => setInviteRole(v as OrgRole)}
              value={inviteRole}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
                {isOwner && <SelectItem value="org:owner">Owner</SelectItem>}
              </SelectContent>
            </Select>
            <Button
              className="shrink-0 gap-2"
              disabled={!inviteEmail || isPendingInvite}
              onClick={handleInvite}
            >
              <UserPlusIcon className="h-4 w-4" strokeWidth={1.75} />
              {isPendingInvite ? "Sending…" : "Invite"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Members table */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-title-md">
            {members.length} {members.length === 1 ? "member" : "members"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40 border-b hover:bg-transparent">
                <TableHead className="h-12 pl-6">Member</TableHead>
                <TableHead className="h-12">Role</TableHead>
                <TableHead className="h-12 w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isSelf = member.userId === currentUserId;
                const isUpdating = updatingMemberId === member.userId;
                const displayName =
                  [member.firstName, member.lastName]
                    .filter(Boolean)
                    .join(" ") || member.emailAddress;

                return (
                  <TableRow
                    className="border-border/40 border-b last:border-0"
                    key={member.membershipId}
                  >
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            alt={displayName}
                            src={member.imageUrl}
                          />
                          <AvatarFallback className="text-label-md">
                            {getInitials(
                              member.firstName,
                              member.lastName,
                              member.emailAddress
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-body-sm leading-none">
                            {displayName}
                            {isSelf && (
                              <span className="ml-2 text-label-md text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-label-md text-muted-foreground">
                            {member.emailAddress}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      {isSelf || (!isOwner && member.role === "org:owner") ? (
                        <RoleBadge role={member.role} />
                      ) : (
                        <Select
                          disabled={isActionPending || isUpdating}
                          onValueChange={(v) =>
                            handleRoleChange(member, v as OrgRole)
                          }
                          value={member.role}
                        >
                          <SelectTrigger className="h-11 w-32 text-label-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((opt) => (
                              <SelectItem
                                className="text-label-md"
                                key={opt.value}
                                value={opt.value}
                              >
                                {opt.label}
                              </SelectItem>
                            ))}
                            {isOwner && (
                              <SelectItem
                                className="text-label-md"
                                value="org:owner"
                              >
                                Owner
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="py-4 pr-4 text-right">
                      {!isSelf && (
                        <Button
                          className="h-11 w-11 text-muted-foreground hover:text-destructive"
                          disabled={isUpdating}
                          onClick={() => setRemoveTarget(member)}
                          size="icon"
                          variant="ghost"
                        >
                          <UserMinusIcon
                            className="h-4 w-4"
                            strokeWidth={1.75}
                          />
                          <span className="sr-only">Remove {displayName}</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-title-md">Pending invitations</CardTitle>
            <CardDescription>
              These people have been invited but haven't accepted yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 border-b hover:bg-transparent">
                  <TableHead className="h-12 pl-6">Email</TableHead>
                  <TableHead className="h-12">Role</TableHead>
                  <TableHead className="h-12">Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((inv) => (
                  <TableRow
                    className="border-border/40 border-b last:border-0"
                    key={inv.id}
                  >
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-2">
                        <MailIcon
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          strokeWidth={1.75}
                        />
                        <span className="text-label-lg">
                          {inv.emailAddress}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <RoleBadge role={inv.role} />
                    </TableCell>
                    <TableCell className="py-4 text-label-lg text-muted-foreground">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ConfirmActionDialog
        confirmLabel="Remove"
        description={
          removeTarget
            ? `Remove ${[removeTarget.firstName, removeTarget.lastName].filter(Boolean).join(" ") || removeTarget.emailAddress} from this organisation? They will lose all access immediately.`
            : ""
        }
        destructive
        onConfirm={handleRemoveConfirm}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        open={removeTarget !== null}
        title="Remove member"
      />
    </div>
  );
};
