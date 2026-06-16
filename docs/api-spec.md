# FinU API Specification

This document is the human-readable API contract for the FinU mobile Flutter client and Hono backend. The machine-readable contract is `openapi.yaml`.

## 1. Contract Summary

- API title: FinU API
- OpenAPI target: 3.0.4
- Base path: unversioned, for example `/auth/login`
- Backend stack: Hono with Zod OpenAPI
- Client stack: Flutter mobile app
- Persistence assumption: PostgreSQL
- ID format: UUID string
- Money format: integer IDR amount, for example `25000`
- Finance date format: date-only `YYYY-MM-DD`
- Audit timestamps: ISO 8601 date-time strings in `createdAt` and `updatedAt`
- Pagination: page/limit, with `limit` constrained to 1-100
- Authentication: Bearer access token plus rotating refresh token

## 2. Authentication

FinU uses backend-owned email/password authentication.

Token lifetimes:

- Access token: 24 hours
- Refresh token: 30 days
- Refresh token rotation: every successful refresh returns a new access token and a new refresh token
- Logout: revokes the current refresh token

Protected endpoints require:

```http
Authorization: Bearer <accessToken>
```

### Auth Endpoints

| Method | Path                    | Purpose                                    |
| ------ | ----------------------- | ------------------------------------------ |
| `POST` | `/auth/register`        | Create an account and return tokens        |
| `POST` | `/auth/login`           | Authenticate and return tokens             |
| `POST` | `/auth/refresh`         | Rotate refresh token and return new tokens |
| `POST` | `/auth/logout`          | Revoke current refresh token               |
| `POST` | `/auth/forgot-password` | Send reset code by email                   |
| `POST` | `/auth/reset-password`  | Reset password using email and reset code  |

Forgot password behavior:

- Backend sends a 6-character alphanumeric code by email.
- User manually enters the code in the Flutter app.
- Code expires after 60 minutes.
- No explicit failed-attempt limit is part of the v1 contract.

## 3. Response Format

All success responses use an envelope.

```json
{
  "data": {},
  "message": "Success",
  "meta": {},
  "warnings": []
}
```

Rules:

- `data` contains the resource or operation result.
- `message` is a short developer-facing success message.
- `meta` is optional and mainly used for pagination.
- `warnings` is optional and used for non-blocking business warnings.

All errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "amount",
        "message": "Amount must be positive"
      }
    ]
  }
}
```

Common error codes:

| Code                   | Typical HTTP status |
| ---------------------- | ------------------- |
| `VALIDATION_ERROR`     | 400                 |
| `UNAUTHENTICATED`      | 401                 |
| `FORBIDDEN`            | 403                 |
| `NOT_FOUND`            | 404                 |
| `CONFLICT`             | 409                 |
| `UNPROCESSABLE_ENTITY` | 422                 |
| `RATE_LIMITED`         | 429                 |
| `INTERNAL_ERROR`       | 500                 |

## 4. Data Model

### User/Profile

```json
{
  "id": "4e571d70-7c45-4478-a681-640c3713b7b1",
  "name": "Alya",
  "email": "alya@example.com",
  "profilePhotoUrl": "/uploads/profile-photos/4e571d70.png",
  "budgetNotificationEnabled": true,
  "createdAt": "2026-04-30T10:00:00Z",
  "updatedAt": "2026-04-30T10:00:00Z"
}
```

Profile photo upload:

- Endpoint: `POST /profile/photo`
- Content type: `multipart/form-data`
- Field: `photo`
- Allowed types: JPEG and PNG
- Maximum size: 5 MB
- Storage contract: backend stores locally and returns a URL such as `/uploads/profile-photos/{fileName}`

### Category

Categories have two types:

- `expense`: used by transactions
- `saving`: used by `saving` type saving entries

```json
{
  "id": "a6b35a79-a0a1-47c2-b881-5047cc36ea3c",
  "type": "expense",
  "name": "Food",
  "iconKey": "food",
  "monthlyBudget": 1000000,
  "savingTarget": null,
  "createdAt": "2026-04-30T10:00:00Z",
  "updatedAt": "2026-04-30T10:00:00Z"
}
```

Rules:

- Category names are unique case-insensitively within the same type.
- List ordering is alphabetical by name.
- `iconKey` is a preset key. Flutter maps it to a display icon.
- `monthlyBudget` is only allowed for `expense` categories.
- `savingTarget` is only allowed for `saving` categories.
- `monthlyBudget` can only be set if the user has at least one `general_income` saving entry.
- Empty budget/target is represented as `null`.

Deletion and undo:

- Delete is soft-delete.
- Related transaction/saving records immediately have `categoryId` set to `null`.
- Flutter displays `categoryId = null` as `Uncategorized`.
- Restore is available for 1 hour.
- Restoring a category also restores the affected records' original category links.

### Transaction

Transactions are expense entries only.

```json
{
  "id": "63f171a2-bc7e-4e2a-863a-427d9da75d90",
  "name": "Lunch",
  "amount": 35000,
  "categoryId": "a6b35a79-a0a1-47c2-b881-5047cc36ea3c",
  "category": {
    "id": "a6b35a79-a0a1-47c2-b881-5047cc36ea3c",
    "type": "expense",
    "name": "Food",
    "iconKey": "food",
    "monthlyBudget": 1000000,
    "savingTarget": null,
    "createdAt": "2026-04-30T10:00:00Z",
    "updatedAt": "2026-04-30T10:00:00Z"
  },
  "date": "2026-04-30",
  "note": "Campus lunch",
  "location": {
    "latitude": -6.2,
    "longitude": 106.816666,
    "source": "gps"
  },
  "createdAt": "2026-04-30T10:00:00Z",
  "updatedAt": "2026-04-30T10:00:00Z"
}
```

Rules:

- `amount` must be positive.
- `date` may be today or in the past, never future.
- `categoryId` is required on create/update and must refer to an `expense` category.
- If `name` is empty, backend defaults it to the category name.
- If spending exceeds the monthly category budget, backend saves the transaction and returns a warning.

Transaction location is optional. Requests may omit `location`, send `location: null`, or send:

```json
{
  "location": {
    "latitude": -6.2,
    "longitude": 106.816666,
    "source": "gps"
  }
}
```

`source` must be `gps` or `manual`. For `PATCH /transactions/{id}`, omitting `location` keeps the current value and `location: null` clears it.

Deletion and undo:

- Delete is soft-delete.
- Restore is available for 1 hour.
- Flutter may expose only a 5-second undo toast.

### Saving

Savings represent general income and saving-target deposits.

Types:

- `general_income`
- `saving`

```json
{
  "id": "b5479e1a-9818-45fa-860e-8d81789f1140",
  "type": "saving",
  "name": "Emergency fund",
  "amount": 200000,
  "categoryId": "44e3d431-e058-412e-a8cc-7f8f0cecfb2b",
  "category": {
    "id": "44e3d431-e058-412e-a8cc-7f8f0cecfb2b",
    "type": "saving",
    "name": "Emergency",
    "iconKey": "emergency",
    "monthlyBudget": null,
    "savingTarget": 5000000,
    "createdAt": "2026-04-30T10:00:00Z",
    "updatedAt": "2026-04-30T10:00:00Z"
  },
  "date": "2026-04-30",
  "note": "April saving",
  "createdAt": "2026-04-30T10:00:00Z",
  "updatedAt": "2026-04-30T10:00:00Z"
}
```

Rules:

- `amount` must be positive.
- `date` may be today or in the past, never future.
- `categoryId` is required when `type = saving`.
- `categoryId` must be omitted or `null` when `type = general_income`.
- If `name` is empty, backend defaults it to `Pemasukan Umum` for `general_income` and the category name for `saving`.
- If total saved exceeds the category saving target, backend saves the entry and returns a warning.

### Activity

Activity is a read-only mixed feed for the Dashboard recent list.

```json
{
  "id": "63f171a2-bc7e-4e2a-863a-427d9da75d90",
  "kind": "transaction",
  "name": "Lunch",
  "amount": 35000,
  "categoryName": "Food",
  "iconKey": "food",
  "date": "2026-04-30",
  "createdAt": "2026-04-30T10:00:00Z"
}
```

Rules:

- `kind` is `transaction` or `saving`.
- Dashboard should request `/activities/recent?limit=5`.
- Flutter computes dashboard totals from raw category, transaction, and saving lists.

## 5. Endpoint Details

### Profile And Settings

| Method  | Path                      | Purpose                               |
| ------- | ------------------------- | ------------------------------------- |
| `GET`   | `/profile`                | Get current profile                   |
| `PATCH` | `/profile`                | Update profile name                   |
| `POST`  | `/profile/photo`          | Upload profile photo                  |
| `PATCH` | `/settings/notifications` | Update budget notification preference |

### Categories

| Method   | Path                               | Purpose                              |
| -------- | ---------------------------------- | ------------------------------------ |
| `GET`    | `/categories?type=expense\|saving` | List categories                      |
| `POST`   | `/categories`                      | Create category                      |
| `GET`    | `/categories/{id}`                 | Get category                         |
| `PATCH`  | `/categories/{id}`                 | Update category                      |
| `DELETE` | `/categories/{id}`                 | Soft-delete category                 |
| `POST`   | `/categories/{id}/restore`         | Restore category within grace period |

### Transactions

| Method   | Path                         | Purpose                             |
| -------- | ---------------------------- | ----------------------------------- |
| `GET`    | `/transactions`              | List expenses                       |
| `POST`   | `/transactions`              | Create expense                      |
| `GET`    | `/transactions/{id}`         | Get expense                         |
| `PATCH`  | `/transactions/{id}`         | Update expense                      |
| `DELETE` | `/transactions/{id}`         | Soft-delete expense                 |
| `POST`   | `/transactions/{id}/restore` | Restore expense within grace period |

Filters:

- `page`
- `limit`
- `month` as `YYYY-MM`
- `categoryId`

### Savings

| Method   | Path                    | Purpose                                         |
| -------- | ----------------------- | ----------------------------------------------- |
| `GET`    | `/savings`              | List income/saving entries                      |
| `POST`   | `/savings`              | Create income/saving entry                      |
| `GET`    | `/savings/{id}`         | Get income/saving entry                         |
| `PATCH`  | `/savings/{id}`         | Update income/saving entry                      |
| `DELETE` | `/savings/{id}`         | Soft-delete income/saving entry                 |
| `POST`   | `/savings/{id}/restore` | Restore income/saving entry within grace period |

Filters:

- `page`
- `limit`
- `type` as `general_income` or `saving`
- `month` as `YYYY-MM`
- `categoryId`

### Activities

| Method | Path                         | Purpose                                  |
| ------ | ---------------------------- | ---------------------------------------- |
| `GET`  | `/activities/recent?limit=5` | Get latest mixed transaction/saving feed |

## 6. Backend-Authoritative Validation

Flutter should mirror these checks for fast UX, but Hono is authoritative:

- Email must be valid.
- Password must be at least 8 characters.
- Name/profile name is required and non-empty.
- Amounts must be positive integer IDR values.
- Finance dates cannot be in the future.
- Category names cannot duplicate case-insensitively within the same category type.
- Expense categories may have `monthlyBudget`; saving categories may have `savingTarget`.
- `monthlyBudget` requires at least one `general_income` saving entry.
- Transaction category must be an `expense` category.
- Saving category must be a `saving` category when saving type is `saving`.
- Profile photo must be JPEG/PNG and at most 5 MB.

## 7. Warning Semantics

Warnings are non-blocking and returned on successful writes.

Expense budget warning example:

```json
{
  "code": "BUDGET_EXCEEDED",
  "message": "Transaction exceeds the category monthly budget",
  "details": {
    "categoryId": "a6b35a79-a0a1-47c2-b881-5047cc36ea3c",
    "monthlyBudget": 1000000,
    "currentMonthSpending": 980000,
    "newTransactionAmount": 50000
  }
}
```

Saving target warning example:

```json
{
  "code": "SAVING_TARGET_EXCEEDED",
  "message": "Saving target has been exceeded",
  "details": {
    "categoryId": "44e3d431-e058-412e-a8cc-7f8f0cecfb2b",
    "savingTarget": 5000000,
    "currentSavedAmount": 4900000,
    "newSavingAmount": 200000
  }
}
```

## 8. Flutter Integration Notes

- Store tokens using secure storage.
- Attach `Authorization: Bearer <accessToken>` to protected requests.
- Refresh on `401 UNAUTHENTICATED` if a refresh token exists.
- Treat `category = null` or `categoryId = null` as `Uncategorized`.
- Use integer IDR formatting in the UI; do not parse amounts as floats.
- Use local selected date as `YYYY-MM-DD` for transactions/savings.
- Compute dashboard summary cards, transaction page totals, saving totals, budget remaining, and saving progress from raw API data.
- Use `/activities/recent?limit=5` for the Dashboard recent list.

## 9. Hono/Zod OpenAPI Notes

- Define Zod schemas once and reuse them for request validation and OpenAPI generation.
- Use explicit response schemas for Flutter code-generation friendliness.
- Use a custom validation error handler that maps Zod errors into the standard error envelope.
- Generate `openapi.yaml` from the Hono route definitions once implementation begins, then compare it against this contract.
- Target OpenAPI 3.0.4 for generator compatibility.
