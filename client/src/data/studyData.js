import {
  Brain,
  Code2,
  Database,
  GitBranch,
  Mic2,
  MonitorCog
} from "lucide-react";

export const views = [
  { id: "home", label: "Home" },
  { id: "pdf", label: "PDF" },
  { id: "video", label: "Video" },
  { id: "pomodoro", label: "Pomodoro" },
  { id: "tasks", label: "Tasks" },
  { id: "music", label: "Music" }
];

export const categories = [
  {
    icon: Database,
    category: "DBMS",
    title: "Normalization notes",
    prompt: "Generate exam revision notes on database normalization in DBMS. Include 1NF, 2NF, 3NF, BCNF, examples, and exam points."
  },
  {
    icon: MonitorCog,
    category: "Operating System",
    title: "Deadlock notes",
    prompt: "Generate structured notes on deadlock in operating systems. Include conditions, prevention, avoidance, detection, and examples."
  },
  {
    icon: GitBranch,
    category: "Data Structures",
    title: "Binary search notes",
    prompt: "Generate quick notes on binary search. Include algorithm, complexity, example, advantages, and common mistakes."
  },
  {
    icon: Brain,
    category: "Artificial Intelligence",
    title: "Neural network notes",
    prompt: "Generate beginner-friendly notes on neural networks. Include neurons, layers, activation functions, training, and applications."
  },
  {
    icon: Code2,
    category: "Java",
    title: "OOP notes",
    prompt: "Generate detailed notes on object-oriented programming in Java. Include classes, objects, inheritance, polymorphism, abstraction, and encapsulation."
  },
  {
    icon: Mic2,
    category: "Web Development",
    title: "DOM notes",
    prompt: "Generate notes on JavaScript DOM manipulation. Include selectors, events, changing content, examples, and best practices."
  }
];

export const curatedLectures = [
  {
    category: "programming",
    title: "Java Programming",
    search: "java programming codewithharry",
    label: "Programming",
    description: "Syntax, OOP, collections, and beginner-friendly Java practice.",
    url: "https://www.youtube.com/playlist?list=PLu0W_9lII9agwh1XjRt242xIpHhPT2llg",
    thumbnail: "https://img.youtube.com/vi/ntLJmHOJ0ME/hqdefault.jpg"
  },
  {
    category: "programming",
    title: "Python Programming",
    search: "python programming codewithharry",
    label: "Programming",
    description: "Python basics, modules, problem solving, and practical examples.",
    url: "https://www.youtube.com/playlist?list=PLu0W_9lII9ahR1blWXxgSlL4y9iQBnLpR",
    thumbnail: "https://img.youtube.com/vi/gfDE2a7MKjA/hqdefault.jpg"
  },
  {
    category: "web",
    title: "HTML and CSS",
    search: "html css net ninja web development",
    label: "Web Development",
    description: "Responsive layouts, styling basics, and hands-on front-end practice.",
    url: "https://www.youtube.com/playlist?list=PL4cUxeGkcC9ivBf_eKCPIAYXWzLlPAm6G",
    thumbnail: "https://img.youtube.com/vi/hu-q2zYwEYs/hqdefault.jpg"
  },
  {
    category: "web",
    title: "JavaScript",
    search: "javascript net ninja web development",
    label: "Web Development",
    description: "DOM, events, async code, and browser interaction fundamentals.",
    url: "https://www.youtube.com/playlist?list=PL4cUxeGkcC9haFPT7J25Q9GRB_ZkFrQAc",
    thumbnail: "https://img.youtube.com/vi/iWOYAxlnaww/hqdefault.jpg"
  },
  {
    category: "dsa",
    title: "DSA in Java",
    search: "dsa java codewithharry data structures algorithms",
    label: "DSA",
    description: "Arrays, linked lists, stacks, queues, trees, graphs, and algorithms.",
    url: "https://www.youtube.com/playlist?list=PLu0W_9lII9ahIappRPN0MCAgtOu3lQjQi",
    thumbnail: "https://img.youtube.com/vi/5_5oE5lgrhw/hqdefault.jpg"
  },
  {
    category: "cs",
    title: "DSA Complete Course",
    search: "dsa complete jenny lectures data structures algorithms",
    label: "CS Core",
    description: "Classroom-style data structures and algorithms explanations.",
    url: "https://www.youtube.com/playlist?list=PLdo5W4Nhv31bbKJzrsKfMpo_grxuLl8LU",
    thumbnail: "https://img.youtube.com/vi/AT14lCXuMKI/hqdefault.jpg"
  }
];
