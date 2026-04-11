# WhaBiz Go-To-Market

Use this checklist to move from a working app to a real launch.

## 1. Minimum commercial
1. Verify a seller can:
   - create an account
   - complete onboarding
   - add products
   - configure payment and delivery
   - share the shop link
2. Verify a customer can:
   - open the boutique
   - add products to cart
   - choose payment and delivery
   - submit an order
3. Verify the seller sees the order details in:
   - `Commandes`
   - `Clients`

## 2. Technical checks
1. Run preflight:
   - `npm run preflight`
2. Run smoke:
   - `npm run test`
3. Run critical flow tests:
   - `npm run test:critical`
4. Run backup:
   - `npm run db:backup`
5. Test restore:
   - `npm run db:restore:test`

## 3. Pilot with 5 sellers
For each pilot seller:
1. Create the account
2. Install the app on Android/iPhone
3. Add at least 3 products
4. Configure payment methods
5. Configure delivery
6. Share the boutique with 3 real contacts
7. Place 1 test order

Track these issues:
1. Signup blocked
2. Product creation blocked
3. Checkout blocked
4. Payment unclear
5. Delivery unclear
6. WhatsApp sharing unclear

## 4. Fix blockers before public launch
Only launch publicly when none of these remain:
1. signup blocker
2. product publish blocker
3. checkout blocker
4. seller order visibility blocker
5. support contact blocker

## 5. Public launch
1. Publish:
   - landing page
   - support page
   - privacy page
   - terms page
2. Keep support WhatsApp active
3. Monitor:
   - `/api/health/details`
   - admin ops
   - new seller signups
   - order creation

## 6. Immediate post-launch metrics
Track only:
1. sellers signed up
2. active sellers
3. boutiques published
4. orders created
5. repeat sellers after 7 days
