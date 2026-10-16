# #111/#112/#156 re-check on production 3.57.1

2026-10-16 ~18:52 UTC, https://www.quizymode.com (3.57.1, includes #157). Same scripts as `../review-signup.mjs` etc., pointed at production with **every API call (the Lightsail host) and every Cognito call stubbed in the browser**, so nothing is sent to or stored by production and no account is created. The `<script>` reason scenario is skipped (the edge in front of production rejects a literal script tag in the query); it is covered locally.

Note: a first run of these scripts had an incorrect stub pattern, so its signup-form interactions did send real analytics events to production (see the #106 comment). The runs whose output is kept here use the corrected stubs; the production event count did not change during them.
