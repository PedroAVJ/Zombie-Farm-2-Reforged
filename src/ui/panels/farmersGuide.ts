import { openModal } from "../Modal";

export interface GuidePage {
  id: string;
  label: string;
  eyebrow?: string;
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
    title: "Welcome to Zombie Farm Reforged",
    intro: "A field guide to for zombie farmers.",
    sections: [
      {
        title: "Zombie Farm Reforged",
        body: "Zombie Farm Reforged is a fan remake of the Zombie Farm games, which were removed from the App Store in 2017. This version incorporates elements from both Zombie Farm 1 and Zombie Farm 2 into a format that is playable on any device that can run a browser. The project is open source and nonprofit.",
      },
    ],
  },
  {
    id: "saves",
    label: "Your saves",
    title: "Local vs. Online Farms",
    intro: "Local Farm and Online Farm are deliberately separate. Progress never transfers or merges between them.",
    sections: [
      {
        title: "Local Farm",
        body: "Saved only in this browser. It works without an account or gameplay server, but clearing browser data or changing devices can remove access to the save. Use Settings to export a backup, which can be imported to any device. A local farm allows you to have full control of your own data and play the game without an internet connection.",
      },
      {
        title: "Online Farm",
        body: "Tied to your signed-in account and saved by the game server. You can continue on another device and use online features. Only one browser or device can control the farm at a time. This is the recommended way to play.",
      },
    ],
  },
  {
    id: "currency",
    label: "Currency",
    title: "Currency",
    intro: "Gold and Brains",
    sections: [
      {
        title: "Gold",
        body: "Gold is the base currency in this game. It is obtained primarily from harvesting crops and completing invasions.",
      },
      {
        title: "Brains",
        body: "Brains are highly valuable on a zombie farm and are used to purchase powerful functional items. Brains may be obtained through invasions and Epic Bosses or received as gifts. Brains are also the primary currency for the Black Market, where farmers may trade zombies. Because there are no in-app purchases, drop rates for brains across the board have been approximately doubled.",
      },
    ],
  },
  {
    id: "mutations",
    label: "Mutations",
    title: "Mutations",
    intro: "Zombies can mutate to take on the characteristics of various plants from your farm!",
    sections: [
      {
        title: "Obtaining Mutations",
        body: "Plant vegetables directly beside a zombie plot to give the harvested zombie a chance at developing the mutation associated with them. If you want to ensure that a specific mutation is obtained, then plant a mutated zombie directly instead.",
      },
      {
        title: "Zombie Pot",
        body: "The Zombie Pot can also combine two zombies and inherit compatible traits. At higher levels, this comes with a low chance of mutating into powerful special zombies.",
      },
    ],
  },
  {
    id: "combat",
    label: "Combat",
    title: "Invasions & Epic Bosses",
    intro: "Put your harvested zombies to work in live battles for loot, experience, gold, and brains.",
    sections: [
      {
        title: "Raids",
        body: "Choose an invasion, assemble an army, and time your focus actions during the fight. Tougher stages bring stronger enemies and better rewards. Fallen zombies are permanently lost, though they may be revived immediately after the battle for the cost of 1 brain.",
      },
      {
        title: "Epic Bosses",
        body: "Starting at level 24, you can begin limited 14-day boss events from Market → Epic Boss. Boss damage carries between attempts. Harvesting crops during an event provides fight tokens, which allow you to take another attempt at the boss. Defeating the boss provides escalating special rewards, including extremely powerful special zombies.",
      },
    ],
  },
  {
    id: "social",
    label: "Social",
    title: "Friends & community",
    intro: "Online Farm adds ways to play alongside other farmers. Community links are also here when you need a hand.",
    sections: [
      {
        title: "Friends",
        body: "Share your friend code with another player to become friends with them. Friends can visit each other’s farms and gift each other brains. A limit of two brains can be gifted per day at no cost to the sender.",
      },
      {
        title: "The Black Market",
        body: "The Black Market is a new feature in Zombie Farm Reforged, which allows farmers to trade zombies for brains. Farmers may request a specific zombie, or put one of their own zombies up for sale.",
      },
      {
        title: "Discord",
        body: "Join the community Discord, The Zombie Farm Archive, to ask for help, share feedback, and meet other farmers. This is also a good place to report bugs or request additional features.",
      },
    ],
  },
  {
    id: "project",
    label: "Project",
    title: "Open source & credits",
    intro: "Zombie Farm 2 Reforged is a non-commercial, open-source fan reimplementation built for study and preservation.",
    sections: [
      {
        title: "GitHub",
        body: "Read the source, report bugs, browse current gaps, or contribute improvements on GitHub. Feel free to branch off of this repository to make your own version as well.",
      },
      {
        title: "Acknowledgements",
        body: "Created and maintained by DoctorNerd. Special thanks to Brain for starting and maintaining the Zombie Farm Archive, without which this project would never have existed. Thank you as well to our alpha testers—Dan, Biggoard, SuperKiwi, and EnchantedKT—for their early feedback and testing.",
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
  heading.innerHTML = "<h2>Farmer’s Guide</h2><p>Field notes for zombie farmers</p>";
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

    const title = document.createElement("h3");
    title.textContent = page.title;
    const intro = document.createElement("p");
    intro.className = "guide-intro";
    intro.textContent = page.intro;
    if (page.eyebrow) {
      const eyebrow = document.createElement("div");
      eyebrow.className = "guide-eyebrow";
      eyebrow.textContent = page.eyebrow;
      article.appendChild(eyebrow);
    }
    article.append(title, intro);

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
