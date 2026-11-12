# Notification transport safety

- FCM receive/tap normalize through `fcmOffer.ts` with an absolute deadline; native Accept/retry checks that original deadline via AlertPresentationRules after refresh and before sending. Why: delayed taps and refreshes must never extend an offer.