export const SITE = {
  website: "https://binaryheap.com/",
  author: "Benjamen Pyle",
  profile: "https://binaryheap.com/about",
  desc: "Software engineering blog covering serverless, Rust, Go, AWS CDK, and cloud architecture by Benjamen Pyle",
  title: "binaryheap",
  ogImage: "og.png",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 8,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true,
  editPost: {
    enabled: false,
    text: "",
    url: "",
  },
  dynamicOgImage: true,
  dir: "ltr",
  lang: "en",
  timezone: "America/Chicago",
} as const;
