# SharePoint List-Scoped Connections — Setup Runbook

How to connect a SharePoint list to Agora with **least-privilege, per-list** access:
the app registration can touch **only** the specific lists you grant it — nothing
else in the site or tenant.

This uses Microsoft Graph's **`Lists.SelectedOperations.Selected`** permission
(currently **beta**). For the simpler site-level model, see the in-app guidance
(Admin → SharePoint) which uses `Sites.Selected` instead.

> **Worked example** below uses the BoudreauLogic site and its *Vehicle Use
> Requests* list. Substitute your own site URL / list where shown.

---

## Concepts (two separate grants)

1. **Entra (Microsoft side):** the app registration is consented to the granular
   Graph permissions, then granted access to **each specific list** via a Graph
   API call. This is the real, Microsoft-enforced boundary.
2. **Agora side:** you register the granted list in Agora and grant **groups**
   access to it. Users only ever see the lists they're allowed to use.

Both are required: the Entra grant lets the *app* reach the list; the Agora grant
lets your *users* use it.

---

## Part A — One-time: app registration (Entra)

1. **Entra admin center → App registrations →** your Agora app.
2. **API permissions → Add a permission → Microsoft Graph → Application
   permissions**, add **both**:
   - `Lists.SelectedOperations.Selected`
   - `ListItems.SelectedOperations.Selected`  *(Agora reads/writes list items)*
3. **Grant admin consent.**
4. (For true least-privilege) remove any broad `Sites.ReadWrite.All` /
   `Sites.Selected` permissions once a list is confirmed working end-to-end.

You'll also need the app's **Application (client) ID** (Entra → your app →
Overview, or Agora → Admin → SharePoint → Client ID).

---

## Part B — Per list: grant the app access (PowerShell)

> **Paste tip:** keep each line short. PowerShell wraps long lines on paste and
> injects newlines mid-command (you'll see `%0A` in errors). Every block below is
> pre-split to stay short. Run the Microsoft Graph PowerShell module as an admin
> who can grant SharePoint permissions.

### 1. Install + connect (one-time install)
```powershell
Install-Module Microsoft.Graph -Scope CurrentUser
Connect-MgGraph -Scopes "Sites.FullControl.All"
```

### 2. Resolve the Site ID
```powershell
$spHost = "netorg19674432.sharepoint.com"
$spPath = "/sites/BoudreauLogic"
$uri = "https://graph.microsoft.com/v1.0/sites/" + $spHost + ":" + $spPath
$site = Invoke-MgGraphRequest -Method GET -Uri $uri
$site.id
```
`$site.id` looks like `netorg19674432.sharepoint.com,<guid>,<guid>` — that's your
**Site ID**.

### 3. Find the List ID
```powershell
$base = "https://graph.microsoft.com/v1.0/sites/"
$uri2 = $base + $site.id + "/lists?" + '$select=id,displayName'
$resp = Invoke-MgGraphRequest -Method GET -Uri $uri2
$resp.value | ForEach-Object { $_.displayName + "  =  " + $_.id }
```
Copy the GUID next to the list you want (e.g. *Vehicle Use Requests*).

### 4. Grant the app **write** access to that list (beta endpoint)
```powershell
$appId  = "PASTE-YOUR-AGORA-APP-CLIENT-ID"
$listId = "3773aadf-f45c-4a5d-880a-77edc468ff27"
$body = @{
  roles = @("write")
  grantedTo = @{ application = @{ id = $appId } }
} | ConvertTo-Json -Depth 5
$gbase = "https://graph.microsoft.com/beta/sites/"
$gurl = $gbase + $site.id + "/lists/" + $listId + "/permissions"
$p = @{ Method = 'POST'; Uri = $gurl }
$p.Body = $body
$p.ContentType = 'application/json'
Invoke-MgGraphRequest @p
```
- `roles` = `"read"` or `"write"`.
- Success = it prints back a permission object with `roles {write}` and
  `grantedTo {application}`.

Repeat steps 2–4 for each list (and each site).

---

## Part C — Per list: register it in Agora

Under list-scoping the app **can't browse** a site, so use **Register by List ID**:

**Admin → SharePoint → Register Lists → Register by List ID:**

| Field | Value |
|-------|-------|
| Name | friendly label, e.g. `Vehicle Use Requests` |
| Site URL | `https://netorg19674432.sharepoint.com/sites/BoudreauLogic` (display only) |
| Site ID | `$site.id` from Part B step 2 |
| List ID | the list GUID from Part B step 3 |

Click **Register list**. Agora calls `GET /sites/{siteId}/lists/{listId}` to
confirm access — a successful registration proves the Entra grant + consent work.

Then on the new row under **Configured Connections**, grant a **group** (or tick
**Visible to all users**) so it appears in the user import picker.

---

## Part D — Use it

**Import from SharePoint** → pick the list → columns load → choose columns →
**Create SharePoint Table** → existing rows auto-pull. Sync works both ways from
there.

---

## Gotchas / troubleshooting

- **"Test Connection" and "Browse Lists" will fail under list-scoping — by
  design.** They make whole-*site* calls (`GET /sites/{id}`), which a list-scoped
  app can't make. A `403 "...required Permission scopes to access a site"` on the
  bare `/sites/{id}` path is *expected* and proves the wall works. Use **Register
  by List ID** instead.
- **A 403 whose path includes `/lists/{listId}`** is a real problem: the grant
  didn't apply, hasn't propagated yet (give it a minute), or the
  `*.SelectedOperations.Selected` consent is missing.
- **It's beta** (`/beta` endpoint). Behavior can change; tenant rollout varies.
- **PowerShell paste wrapping:** if you see `%0A`/`%20` in an error URL, the line
  wrapped — re-run using the short-line blocks above, or split long lines.
- **Keep one list working end-to-end before stripping broad `Sites.*`
  permissions**, so you can tell what broke if something does.
