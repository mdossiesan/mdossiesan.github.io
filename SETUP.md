# Setting up sign-in, sync and AI food scanning

The site works without any of this; your log is then saved only in the browser you use.
These steps add a free Supabase project (sign-in + database + a small server function) and
connect it to Claude for AI food scanning. Plan on about 15 minutes.

## Part A: Supabase (free)

1. Go to **supabase.com** and sign up. Signing in with GitHub works.
2. Create a **new project**. Name it `dsj`, pick the region closest to you, and set a database
   password (save it somewhere safe). The free plan is enough. Wait a couple of minutes while it starts.
3. Open **SQL Editor → New query**, paste everything from
   [`supabase/schema.sql`](https://raw.githubusercontent.com/mdossiesan/mdossiesan.github.io/main/supabase/schema.sql)
   and press **Run**. It should finish with "Success".
4. Open **Authentication → URL Configuration**:
   - **Site URL**: `https://mdossiesan.github.io/tracking/`
   - **Redirect URLs**: add `https://mdossiesan.github.io/**`
5. Open **Project Settings → API** (or the **Connect** button) and copy two values:
   the **Project URL** and the **anon / publishable key**. Both are public by design, so you can
   paste them in chat. They go into `assets/config.js`.

## Part B: the AI scanner

6. Go to **console.anthropic.com**, sign up, add a little credit under **Billing**, then open
   **API Keys → Create Key** and copy the key (it starts with `sk-ant-`).
   **Don't paste this key in chat or anywhere public.**
7. In Supabase, open **Edge Functions → Secrets** (sometimes under Project Settings → Edge Functions)
   and add:
   - `ANTHROPIC_API_KEY` = the key from step 6
   - `ALLOWED_EMAILS` = the email you'll sign in with (so only you can use your AI credit)
8. Open **Edge Functions → Deploy a new function → Via editor**. Name it exactly **`scan-food`**,
   replace the sample code with everything from
   [`supabase/functions/scan-food/index.ts`](https://raw.githubusercontent.com/mdossiesan/mdossiesan.github.io/main/supabase/functions/scan-food/index.ts),
   and press **Deploy**.

## Part C: sign in

9. Once `assets/config.js` has your values and the site has updated, open **Start Tracking**,
   tap the **person icon** at the top, choose **Create account**, and use your email and a password.
   Confirm the email if asked, then sign in. Anything already logged on that phone uploads automatically.
10. Optional but recommended: in Supabase, open **Authentication → Sign In / Providers** and turn off
    **Allow new users to sign up**, so nobody else can create an account on your site.

## Good to know

- Each scan uses Claude Opus 5.5 and costs a few cents on your Anthropic account. If Anthropic's
  safety filter declines a photo, the request retries automatically on another Claude model.
- Free Supabase projects pause after about a week with no activity. If sign-in stops working,
  open the Supabase dashboard and restore the project.
- Your data lives in one table, `entries`, and its rules let each account read and write only its own rows.
