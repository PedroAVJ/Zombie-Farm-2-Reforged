import { openModal } from "../Modal";

export interface GuidePage {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{
    title: string;
    body: string;
  }>;
}

export const FARMERS_GUIDE_PAGES: GuidePage[] = [
  {
    id: "welcome",
    label: "Welcome",
    eyebrow: "Start here",
    title: "Welcome, farmer!",
    intro: "A field guide to growing a thriving farm—and an even better zombie horde.",
    sections: [
      {
        title: "The farm loop",
        body: "Plow soil, plant crops or zombies, wait for them to grow, then harvest. Crops earn gold; zombies join your roster for invasions.",
      },
      {
        title: "Good to know",
        body: "Your farm keeps its unfinished jobs and growth timers when you leave. Select growing plants to see their remaining time or use an Insta-Grow boost.",
      },
    ],
  },
  {
    id: "saves",
    label: "Your saves",
    eyebrow: "Local & online",
    title: "Two farms, two saves",
    intro: "Local Farm and Online Farm are deliberately separate. Progress never transfers or merges between them.",
    sections: [
      {
        title: "Local Farm",
        body: "Saved only in this browser. It works without an account or gameplay server, but clearing browser data or changing devices can remove access to the save. Use Settings to export a backup.",
      },
      {
        title: "Online Farm",
        body: "Tied to your signed-in account and saved by the game server. You can continue on another device and use online features. Only one browser or device can control the farm at a time.",
      },
    ],
  },
  {
    id: "growing",
    label: "Growing",
    eyebrow: "Farm mechanics",
    title: "Mutations & fertilization",
    intro: "Smart planting turns ordinary harvests into stronger zombies and more valuable crops.",
    sections: [
      {
        title: "Mutations",
        body: "Plant mutation vegetables directly beside a zombie plot—north, south, east, or west—to give the harvested zombie a chance at matching body-part mutations. The Zombie Pot can also combine two zombies and inherit compatible traits.",
      },
      {
        title: "Fertilization",
        body: "Garden-type zombies may fertilize a newly planted vegetable crop. Fertilized crops show drifting leaves and pay double gold when harvested. Zombie crops are not fertilized.",
      },
    ],
  },
  {
    id: "combat",
    label: "Combat",
    eyebrow: "Build your horde",
    title: "Raids & Epic Bosses",
    intro: "Put your harvested zombies to work in live battles for loot, experience, gold, and brains.",
    sections: [
      {
        title: "Raids",
        body: "Choose an invasion, assemble an army, and time your focus actions during the fight. Tougher stages bring stronger enemies and better rewards. Fallen zombies are permanently lost unless you accept the post-battle revival offer.",
      },
      {
        title: "Epic Bosses",
        body: "Start a limited 14-day boss event from Market → Epic Boss. Boss damage carries between attempts. Harvest event crops for fight tokens, or spend one brain per attempt, and defeat escalating levels for special rewards.",
      },
    ],
  },
  {
    id: "social",
    label: "Social",
    eyebrow: "Online Farm",
    title: "Friends & community",
    intro: "Online Farm adds ways to play alongside other farmers. Community links are also here when you need a hand.",
    sections: [
      {
        title: "Social features",
        body: "Share friend codes, send a free daily brain, claim gifts, visit friends’ farms in read-only mode, and trade zombies through the Black Market.",
      },
      {
        title: "Discord",
        body: "Join the community Discord to ask for help, share feedback, and meet other farmers. The invite link will be added here soon.",
      },
    ],
  },
  {
    id: "project",
    label: "Project",
    eyebrow: "Made in the open",
    title: "Open source & credits",
    intro: "Zombie Farm 2 Reforged is a non-commercial, open-source fan reimplementation built for study and preservation.",
    sections: [
      {
        title: "GitHub",
        body: "Read the source, report bugs, browse current gaps, or contribute improvements on GitHub.",
      },
      {
        title: "Acknowledgements",
        body: "Created and maintained by actualdoctornerd-ai, with development contributions from Caelen Miller. Special thanks to every alpha tester for early feedback, and to all code, research, documentation, and community contributors who keep the farm growing.",
      },
    ],
  },
];

const GITHUB_URL = "https://github.com/actualdoctornerd-ai/Zombie-Farm-2-Reforged";

function externalLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "guide-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

export function openFarmersGuide(host: HTMLElement): void {
  const { panel } = openModal({
    host,
    bgClass: "guide-bg",
    panelClass: "guide-panel",
    replaceSelector: ".guide-bg",
  });

  const header = document.createElement("header");
  header.className = "guide-header";
  const mark = document.createElement("span");
  mark.className = "guide-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "📖";
  const heading = document.createElement("div");
  heading.innerHTML = "<h2>Farmer’s Guide</h2><p>Field notes for the freshly undead</p>";
  header.append(mark, heading);

  const layout = document.createElement("div");
  layout.className = "guide-layout";
  const nav = document.createElement("nav");
  nav.className = "guide-nav";
  nav.setAttribute("aria-label", "Farmer’s Guide pages");
  const article = document.createElement("article");
  article.className = "guide-article";
  article.setAttribute("aria-live", "polite");

  const footer = document.createElement("div");
  footer.className = "guide-footer";
  const position = document.createElement("span");
  position.className = "guide-position";
  const controls = document.createElement("div");
  controls.className = "guide-controls";
  const previous = document.createElement("button");
  previous.className = "guide-button";
  previous.textContent = "← Previous";
  const next = document.createElement("button");
  next.className = "guide-button guide-next";
  next.textContent = "Next →";
  controls.append(previous, next);
  footer.append(position, controls);

  let activeIndex = 0;
  const navButtons = FARMERS_GUIDE_PAGES.map((page, index) => {
    const button = document.createElement("button");
    button.className = "guide-nav-button";
    button.textContent = page.label;
    button.onclick = () => render(index);
    nav.appendChild(button);
    return button;
  });

  const render = (index: number) => {
    activeIndex = index;
    const page = FARMERS_GUIDE_PAGES[index];
    article.replaceChildren();

    const eyebrow = document.createElement("div");
    eyebrow.className = "guide-eyebrow";
    eyebrow.textContent = page.eyebrow;
    const title = document.createElement("h3");
    title.textContent = page.title;
    const intro = document.createElement("p");
    intro.className = "guide-intro";
    intro.textContent = page.intro;
    article.append(eyebrow, title, intro);

    for (const section of page.sections) {
      const block = document.createElement("section");
      const sectionTitle = document.createElement("h4");
      sectionTitle.textContent = section.title;
      const body = document.createElement("p");
      body.textContent = section.body;
      block.append(sectionTitle, body);
      if (page.id === "project" && section.title === "GitHub")
        block.appendChild(externalLink("Open the GitHub repository ↗", GITHUB_URL));
      article.appendChild(block);
    }

    navButtons.forEach((button, buttonIndex) => {
      button.classList.toggle("active", buttonIndex === activeIndex);
      button.setAttribute("aria-current", buttonIndex === activeIndex ? "page" : "false");
    });
    position.textContent = `${activeIndex + 1} of ${FARMERS_GUIDE_PAGES.length}`;
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === FARMERS_GUIDE_PAGES.length - 1;
  };

  previous.onclick = () => render(Math.max(0, activeIndex - 1));
  next.onclick = () => render(Math.min(FARMERS_GUIDE_PAGES.length - 1, activeIndex + 1));

  layout.append(nav, article);
  panel.append(header, layout, footer);
  render(0);
}
