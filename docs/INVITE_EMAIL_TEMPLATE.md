# Invite Email Template (Supabase)

When you invite users from **Preferences → Users**, Supabase sends an invite email. To include the **company code** in that email (so invited users can log in), customize the template in Supabase.

## Setup

1. Open **Supabase Dashboard** → **Authentication** → **Email Templates**
2. Select **Invite user**
3. Add the company code to the body, for example:

```
<h2>You're invited to join</h2>
<p>Click the link below to set your password:</p>
<p><a href="{{ .ConfirmationURL }}">Accept invitation</a></p>

<p>Your company code for login: <strong>{{ .Data.company_code }}</strong></p>
<p>Use this code with your email and password when logging in.</p>
```

4. Save the template.

Invited users will then receive the company code in the email. They use it at the login page together with their email and the password they set.
