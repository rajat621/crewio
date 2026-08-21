
const employeesData = [
  {
    id: "EMP0001",
    name: "Aarav Sharma",
    phone: "+977 9812345671",
    trade: "Electrician",
    rate: "10.00",
    joined: "12 Jan 2023",

    company: "MCC",
    project: "P1001",
    startDate: "12 Jan 2023",
    assignedStatus: "on-site",

    checkIn: "09:02 AM",
    checkOut: "06:01 PM",
    totalWorks: 180,
    totalAbsent: 3,
    attendanceStatus: "present",

    passportNo: "PA100001",
    passportExpiry: "15 Feb 2027",
    passportStatus: "valid",

    liveStatus: "present",
  },
  {
    id: "EMP0002",
    name: "Ramesh Thapa",
    phone: "+977 9812345672",
    trade: "Mason",
    rate: "8.50",
    joined: "03 Mar 2022",

    company: "L&T",
    project: "P1002",
    startDate: "03 Mar 2022",
    assignedStatus: "site-over",

    checkIn: "09:35 AM",
    checkOut: "05:45 PM",
    totalWorks: 210,
    totalAbsent: 12,
    attendanceStatus: "late",

    passportNo: "PA100002",
    passportExpiry: "02 Apr 2026",
    passportStatus: "expiring-soon",

    liveStatus: "present",
  },
  {
    id: "EMP0003",
    name: "Sanjay Yadav",
    phone: "+977 9812345673",
    trade: "Welder",
    rate: "11.00",
    joined: "19 Aug 2021",

    company: "",
    project: "",
    startDate: "",
    assignedStatus: "site-over",

    checkIn: "",
    checkOut: "",
    totalWorks: 0,
    totalAbsent: 0,
    attendanceStatus: "absent",

    passportNo: "PA100003",
    passportExpiry: "10 Dec 2023",
    passportStatus: "expired",

    liveStatus: "absent",
  },
  {
    id: "EMP0004",
    name: "Vikram Singh",
    phone: "+977 9812345674",
    trade: "Plumber",
    rate: "9.00",
    joined: "01 Jun 2023",

    company: "MCC",
    project: "P1253",
    startDate: "01 Jun 2023",
    assignedStatus: "on-site",

    checkIn: "08:55 AM",
    checkOut: "06:10 PM",
    totalWorks: 120,
    totalAbsent: 1,
    attendanceStatus: "present",

    passportNo: "PA100004",
    passportExpiry: "18 Nov 2028",
    passportStatus: "valid",

    liveStatus: "present",
  },
  {
    id: "EMP0005",
    name: "Kiran BK",
    phone: "+977 9812345675",
    trade: "Helper",
    rate: "6.50",
    joined: "15 Feb 2024",

    company: "TATA",
    project: "P2001",
    startDate: "15 Feb 2024",
    assignedStatus: "on-site",

    checkIn: "",
    checkOut: "",
    totalWorks: 30,
    totalAbsent: 5,
    attendanceStatus: "on-leave",

    passportNo: "PA100005",
    passportExpiry: "22 Jan 2026",
    passportStatus: "expiring-soon",

    liveStatus: "on-leave",
  },

  // ---------- BULK GENERATED VARIANTS ----------
  ...Array.from({ length: 45 }, (_, i) => {
    const index = i + 6;
    const statuses = ["on-site", "site-over", "site-over"];
    const attendance = ["present", "late", "absent", "on-leave"];
    const passportStates = ["valid", "expiring-soon", "expired"];
    const trades = ["Carpenter", "Electrician", "Mason", "Welder", "Painter"];
    const companies = ["MCC", "L&T", "TATA", "ADANI", ""];

    return {
      id: `EMP${String(index).padStart(4, "0")}`,
      name: `Employee ${index}`,
      phone: `+977 98123${Math.floor(10000 + Math.random() * 89999)}`,
      trade: trades[index % trades.length],
      rate: (6 + (index % 7)).toFixed(2),
      joined: "01 Jan 2022",

      company: companies[index % companies.length],
      project: companies[index % companies.length] ? `P${1000 + index}` : "",
      startDate: companies[index % companies.length] ? "01 Jan 2022" : "",
      assignedStatus: statuses[index % statuses.length],

      checkIn: attendance[index % attendance.length] === "present" ? "09:00 AM" : "",
      checkOut: attendance[index % attendance.length] === "present" ? "06:00 PM" : "",
      totalWorks: index * 5,
      totalAbsent: index % 10,
      attendanceStatus: attendance[index % attendance.length],

      passportNo: `PA10${index}`,
      passportExpiry:
        passportStates[index % passportStates.length] === "expired"
          ? "01 Jan 2024"
          : passportStates[index % passportStates.length] === "expiring-soon"
          ? "01 Jun 2026"
          : "01 Jan 2029",
      passportStatus: passportStates[index % passportStates.length],

      liveStatus:
        attendance[index % attendance.length] === "present"
          ? "present"
          : attendance[index % attendance.length] === "on-leave"
          ? "on-leave"
          : "absent",
    };
  }),
];

export default employeesData;
