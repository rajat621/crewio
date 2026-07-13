# UI/Screen Design Reference

Please share wireframes, mockups, or Figma links for these screens. I'll implement them exactly as designed.

---

## 1. Authentication Screens

### 1.1 Login Screen
**Elements needed**:
- Email input field
- Password input field
- "Remember me" checkbox (optional)
- "Login" button
- "Sign up" link
- "Forgot password" link (optional)
- Social login buttons (optional - Google, Apple, etc)

**Reference Layout**:
```
┌─────────────────────┐
│   CrewIO Logo       │
│                     │
│ ┌─────────────────┐ │
│ │ Email input     │ │
│ └─────────────────┘ │
│                     │
│ ┌─────────────────┐ │
│ │ Password input  │ │
│ └─────────────────┘ │
│                     │
│ ☐ Remember me       │
│                     │
│ ┌─────────────────┐ │
│ │  Login Button   │ │
│ └─────────────────┘ │
│                     │
│ Don't have account? │
│ [Sign Up]           │
└─────────────────────┘
```

### 1.2 Register Screen
**Elements needed**:
- Name input
- Email input
- Phone input (optional)
- Password input
- Confirm password input
- Terms checkbox
- "Register" button
- Back to login link

---

## 2. Home / Dashboard Screen

### 2.1 Attendance Card (Top Section)
**Elements needed**:
- Display current check-in status
- Show check-in time (if checked in)
- Show check-out time (if checked out)
- "Check In" button (if not checked in)
- "Check Out" button (if checked in)
- Location indicator (GPS status)
- Last check-in/out time

**Reference**:
```
┌────────────────────────────┐
│ Attendance - 2 May 2026    │
├────────────────────────────┤
│ Status: Present ✓          │
│                            │
│ Check In:  09:30 AM        │
│ Location:  ✓ GPS Ready     │
│                            │
│ ┌─────────────┬──────────┐ │
│ │ Check In    │ Check Out│ │
│ │   (Done)    │  (Ready) │ │
│ └─────────────┴──────────┘ │
└────────────────────────────┘
```

### 2.2 Messages / Chat Section
**Elements needed**:
- List of conversations
- Unread count badge
- Last message preview
- Last message timestamp
- User avatar
- "New message" FAB

**Reference**:
```
┌────────────────────────────┐
│ Messages                   │
├────────────────────────────┤
│ ┌──────────────────────┐   │
│ │ 👤 John Doe      (2) │   │
│ │ Last message...      │   │
│ │ 2 mins ago           │   │
│ └──────────────────────┘   │
│                            │
│ ┌──────────────────────┐   │
│ │ 👤 Project Team  (5) │   │
│ │ Next standup today   │   │
│ │ 1 hour ago           │   │
│ └──────────────────────┘   │
└────────────────────────────┘
```

---

## 3. Chat Screen

### 3.1 Conversation View
**Elements needed**:
- Header: Conversation name, online status
- Message list with:
  - Sender name
  - Message text
  - Timestamp
  - Read receipt (checkmarks)
  - Avatar
  - Message bubble style (left for others, right for self)
- Typing indicator
- Message input field
- Send button
- Attachment button (optional)
- Back button

**Reference**:
```
┌────────────────────────────┐
│ ◄ John Doe        (Online) │
├────────────────────────────┤
│                            │
│    John is typing... 💬    │
│                            │
│ ┌─────────────────────┐    │
│ │ Hello! How are you? │    │
│ │ 2:30 PM         ✓✓ │    │
│ └─────────────────────┘    │
│                   ┐        │
│            ┌──────────────┐│
│            │ I'm good! 😊 ││
│            │ 2:31 PM      ││
│            └──────────────┘│
│                            │
│ ┌──────────────────────┐   │
│ │ Type message...  📎  │ ✓ │
│ └──────────────────────┘   │
└────────────────────────────┘
```

### 3.2 Conversation List (Detail)
**Elements needed**:
- Search bar
- Sort options (by date, unread, etc)
- Filter options (all, unread, archived)
- Swipe actions (archive, delete, mute)

---

## 4. Attendance / Reports Screen

### 4.1 Daily Attendance View
**Elements needed**:
- Calendar picker
- Check-in/out times
- Location map or static location
- Duration worked
- Status badge (present, absent, half-day, leave)
- Edit option (for admins)

**Reference**:
```
┌────────────────────────────┐
│ Attendance - [2 May 2026 ▼]│
├────────────────────────────┤
│                            │
│ Status: PRESENT ✓          │
│                            │
│ Check In:  09:30 AM        │
│ Check Out: 06:00 PM        │
│ Duration:  8h 30m          │
│                            │
│ Locations:                 │
│ ┌──────────────────────┐   │
│ │   [MAP EMBED]        │   │
│ │   Office, Downtown   │   │
│ └──────────────────────┘   │
│                            │
│     [View History]         │
└────────────────────────────┘
```

### 4.2 Attendance History / Report
**Elements needed**:
- Date range picker
- Table/list of attendance records
- Columns: Date, Check-in, Check-out, Duration, Status
- Export options (PDF, CSV)
- Summary stats (days present, absent, leaves)

**Reference**:
```
┌────────────────────────────┐
│ Attendance Report          │
│ [From] ▼  [To] ▼          │
├────────────────────────────┤
│ Date    | In    | Out | Sts│
├────────────────────────────┤
│ May 1   | 9:30  | 6:00| ✓ │
│ May 2   | 9:15  | 6:10| ✓ │
│ May 3   | ----- | ----| ✗ │
│ May 4   | 9:45  | 1:00| ◐ │
├────────────────────────────┤
│ Present: 3 days            │
│ Absent:  1 day             │
│ Leave:   0 days            │
│                            │
│   [Export PDF]  [Print]    │
└────────────────────────────┘
```

---

## 5. User Profile / Settings Screen

### 5.1 Profile View
**Elements needed**:
- Avatar image (can be initials)
- Name
- Email
- Phone
- Department / Role
- Last updated time
- Edit button

**Reference**:
```
┌────────────────────────────┐
│ Profile                    │
├────────────────────────────┤
│                            │
│         👤 JD              │
│                            │
│  Name: John Doe            │
│  Email: john@example.com   │
│  Phone: +1 234 567 8900    │
│  Role: Senior Developer    │
│                            │
│      [Edit Profile]        │
│      [Change Password]     │
│      [Logout]              │
│                            │
└────────────────────────────┘
```

### 5.2 Settings Screen
**Elements needed**:
- Theme (Light/Dark mode toggle)
- Notifications (toggle)
- Notification sound
- Notification vibration
- Auto-sync preference
- Language preference
- About section
- Version info

---

## 6. Navigation / Tabs

### Bottom Navigation (for phone)
**Tabs needed**:
1. **Home** - Dashboard with attendance
2. **Chat** - Messages & conversations
3. **Attendance** - History & reports
4. **Profile** - Settings & user info

**Icons & labels**:
```
┌─────────────────────────────────────┐
│ [Home]  [Chat] [History] [Profile] │
│   🏠      💬      📋        👤       │
└─────────────────────────────────────┘
```

### Top Navigation (for web/tablet)
- Hamburger menu or horizontal menu bar
- Mobile-responsive (collapse on small screens)

---

## 7. Offline Indicators

### Offline Status UI
**Elements needed**:
- Banner at top when offline
- "You're offline" message
- Sync status indicator
- Pending changes count
- Manual sync button

**Reference**:
```
┌────────────────────────────┐
│ 🔴 Offline - Syncing (3)   │
│ [Manual Sync] [Dismiss]    │
└────────────────────────────┘
```

---

## 8. Loading & Error States

### Loading Screen
- Spinner / skeleton placeholders
- "Loading..." message

### Error Screen
- Error icon
- Error message
- "Retry" button
- "Go Back" button

### Empty State
- Empty illustration
- "No conversations yet"
- "Create new conversation" button

---

## 9. Forms & Modals

### New Conversation Modal
**Elements needed**:
- Search participants input
- Multi-select participants
- Optional conversation name
- Create button
- Cancel button

### Send Message Dialog (long message)
- Expandable text field
- Character count
- Send button
- Cancel button

---

## 10. Color & Theme

### Suggested Color Palette
- **Primary**: Indigo (#6366F1) or your brand color
- **Secondary**: Light Gray (#F3F4F6)
- **Success**: Green (#10B981)
- **Error**: Red (#EF4444)
- **Warning**: Amber (#F59E0B)
- **Info**: Blue (#3B82F6)

### Typography
- Heading 1: 32px Bold
- Heading 2: 24px Bold
- Body: 14px Regular
- Small: 12px Regular
- Monospace: for timestamps/codes

---

## What I Need From You

1. **Figma Link** or **Mockup Images** (Sketch, AdobeXD, etc)
   - Share as link or screenshots
   - Include all 5 main screens minimum

2. **Specific Requirements**:
   - Brand colors & logo
   - Custom fonts (or use default)
   - Icon style (Material Design, Custom, etc)
   - Animation preferences (smooth, subtle, none)

3. **Platform Priority**:
   - Android first?
   - iOS?
   - Web?
   - All equally?

4. **Additional Screens**:
   - Admin dashboard?
   - Approval workflows?
   - Analytics?
   - Reporting?

---

## Once You Share Designs

I will:
1. Implement UI exactly as designed
2. Integrate with existing backend/sync
3. Add responsive design for all screen sizes
4. Implement proper animations & transitions
5. Test on emulator & real devices
6. Optimize performance

**Share designs in the next message, and I'll implement them immediately!**

---

**Format Accepted**:
- ✅ Figma links (preferably)
- ✅ PNG/JPG screenshots
- ✅ Sketch/Adobe XD files
- ✅ Hand-drawn wireframes (with clear labels)
- ✅ Detailed text descriptions
