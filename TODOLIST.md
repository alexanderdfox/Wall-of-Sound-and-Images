# Tchoff — Todo List

Potential improvements and future work.

---

## Features

- [ ] **Comment reports** — Extend reports to `content_type: comment` and allow disabling individual comments from backend
- [ ] **Re-enable content** — Allow admin to re-enable previously disabled images/sounds
- [ ] **Report resolution status** — Track resolved/closed reports in the reports table
- [ ] **Sound origin IP** — Add `origin_ip` to sounds table (like images) for poster IP in reports
- [ ] **Password reset** — Forgot-password flow (email-based reset link)
- [ ] **Email verification** — Optional email verification on signup

---

## Admin / Backend

- [ ] **Bulk disable** — Select multiple reports and disable in one action
- [ ] **Report filters** — Filter by reason (copyright, illegal, other), content type, date
- [ ] **Export reports** — CSV or JSON export for records

---

## UX / UI

- [ ] **Skip loading screen** — Option (e.g. query param or sessionStorage) to skip 5s splash for returning users
- [ ] **Loading states** — Skeleton loaders for feed, sound wall, etc.

---

## Technical

- [ ] **Run migrations 0010 & 0011** — If not yet applied: `cf:d1:migrate-reports-ip`, `cf:d1:migrate-disabled`
- [ ] **Package.json script** — Add `cf:d1:migrate-disabled` for migration 0011
- [ ] **Tests** — Unit or integration tests for auth, reports, disable logic

---

## Nice to have

- [ ] Rate limiting on report submission
- [ ] Notifications when content is disabled (to poster)
- [ ] Audit log for admin actions (who disabled what, when)
