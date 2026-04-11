Organize your Google Photos albums into **nested folders** automatically.

## How does it work?

The extension reads your album names and organizes them into a folder hierarchy using the `/` separator.

**Examples:**

- `FAMILY / General` → folder **_FAMILY_** with album **_General_**
- `WORK / IT / My_Company` → **_WORK_** > **_IT_** > **_My_Company_**
- `FRIENDS / [2024-09] Cousins Wedding` → **_FRIENDS_** folder, album **_Cousins Wedding_** (with date chip)

Compare how the grid is updated: 
<div style="display: flex; justify-content: center;">
  <img src="https://github.com/user-attachments/assets/a2e58af0-c623-42ff-9e9a-3426f0837225" width="49%" />
  <img src="https://github.com/user-attachments/assets/9d34ac7c-8ffe-460c-b4ef-7bf262a5296d" width="49%" />
</div>

## Features

- 🗂️ **Nested folders** with no depth limit
- 🖼️ **2×2 mosaic** with covers from the first albums
- 📅 **Date chips** for albums in `[yyyy-mm]` format
- 🧭 **Navigation breadcrumb**
- 🌑 Light/Dark theme that matches Google Photos

## Naming convention

Name your albums using the format:

```
FOLDER / SUBFOLDER / [yyyy-mm] Album name
```

The separator is `/` (slash with spaces on both sides, or just `/`).

## Installation

1. Download and unzip the extension ZIP
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right corner)
4. Click **"Load unpacked"**
5. Select the `google-photos-folders` folder
6. Go to [Google Photos > Albums](https://photos.google.com/albums)

## Notes

- The extension doesn’t modify or upload anything; it only changes how the list is displayed.
- Albums without `/` in the name appear directly in the root.
- Clicking an album takes you to the actual Google Photos album.
