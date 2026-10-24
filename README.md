# 3×3

A buildless personal collection site. Run `npm run dev` and open http://127.0.0.1:3000.

Home is read-only. Edit changes the profile, and each collection opens its own editor. Upload images, drag or use arrow keys to reposition, adjust zoom, then save. Profile changes require Save profile; collection changes require Save 3×3. Empty slots are allowed.

Data is saved in IndexedDB on this browser and origin. This prototype has one local profile, no authentication, and no shared or cross-device data. Clearing browser data removes saved collections. Deploying the static source does not upload the locally entered profile or images.
