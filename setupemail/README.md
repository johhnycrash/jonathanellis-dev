# /setupemail/

One-tap Apple Mail profiles for `@jonathanellis.dev` addresses.

## Current profiles

- `hello.mobileconfig` → `hello@jonathanellis.dev`

## Adding a new mailbox profile

Say you create `accounts@jonathanellis.dev` in HestiaCP and want a profile for it:

1. Copy `hello.mobileconfig` to `accounts.mobileconfig` inside this folder.
2. Open `accounts.mobileconfig` in an editor.
3. Replace **every** occurrence of `hello` with `accounts` (the email local-part).
4. Regenerate the two `<string>` UUIDs so they're unique. You can use any online UUID generator or run:
   ```bash
   uuidgen
   uuidgen
   ```
   Replace the two UUIDs near the top of the file (`PayloadUUID` inside the mail payload, and the outer `PayloadUUID` near the bottom).
5. Update `PayloadIdentifier` strings:
   - Inner: `dev.jonathanellis.mail.accounts`
   - Outer: `dev.jonathanellis.mailsetup.accounts`
6. Add a new account card in `index.html`:
   ```html
   <div class="account-card">
     <div class="info">
       <div class="addr">accounts@jonathanellis.dev</div>
       <div class="desc">All-mail central inbox · IMAP · SSL</div>
     </div>
     <a class="btn" href="/setupemail/accounts.mobileconfig" download>Install profile →</a>
   </div>
   ```
7. Commit, push — Coolify redeploys in ~60s.

## Why we don't bake the password in

Mobileconfigs CAN include the mailbox password so users don't have to type it. We don't — because the file is publicly downloadable from the site, and anyone who grabs it would get the credentials. iOS/macOS prompts for the password at install time instead, which is safer.

If you want a private variant for a specific person that DOES include their password, make a copy, add an `EmailAccountPassword` string under the mail payload, host at a non-linked URL (or password-gate it), and delete after they install.
