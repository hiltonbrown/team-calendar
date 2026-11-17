export const coreSchemaOptions = {
  account: {
    fields: {
      accessToken: "access_token",
      accessTokenExpiresAt: "access_token_expires_at",
      accountId: "provider_subject",
      createdAt: "created_at",
      idToken: "id_token",
      providerId: "provider_id",
      refreshToken: "refresh_token",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      updatedAt: "updated_at",
      userId: "user_id",
    },
    modelName: "AuthIdentity",
  },
  session: {
    fields: {
      createdAt: "created_at",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      updatedAt: "updated_at",
      userAgent: "user_agent",
      userId: "user_id",
    },
    modelName: "AuthSession",
  },
  user: {
    fields: {
      createdAt: "created_at",
      emailVerified: "email_verified",
      updatedAt: "updated_at",
    },
    modelName: "AuthUser",
  },
  verification: {
    fields: {
      createdAt: "created_at",
      expiresAt: "expires_at",
      updatedAt: "updated_at",
    },
    modelName: "AuthVerification",
  },
} as const;

export const organizationSchema = {
  invitation: {
    fields: {
      createdAt: "created_at",
      expiresAt: "expires_at",
      inviterId: "inviter_id",
      organizationId: "account_id",
    },
    modelName: "AuthInvitation",
  },
  member: {
    fields: {
      createdAt: "created_at",
      organizationId: "account_id",
      userId: "user_id",
    },
    modelName: "AuthMember",
  },
  organization: {
    additionalFields: {
      countryCode: {
        fieldName: "country_code",
        required: true,
        type: "string",
      },
      provisioningStatus: {
        defaultValue: "pending",
        fieldName: "provisioning_status",
        input: false,
        required: true,
        type: "string",
      },
    },
    fields: { createdAt: "created_at" },
    modelName: "AuthOrganization",
  },
  session: {
    fields: { activeOrganizationId: "active_account_id" },
  },
} as const;

export const rateLimitSchemaOptions = {
  fields: { lastRequest: "last_request" },
  modelName: "AuthRateLimit",
} as const;
