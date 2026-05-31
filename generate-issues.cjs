const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('crypto'); // We'll just generate random IDs

const categories = [
  "Mental Health",
  "Money & Finance",
  "Relationships",
  "Identity & Society",
  "Career & Education",
  "Personality & Self",
  "City Life",
  "Modern Culture"
];

// Content generators
const themes = {
  "Mental Health": ["Therapy vs Reality", "The Weight of Expectations", "Unlearning Toxic Resilience", "Quiet Anxiety", "Navigating Grief in a Loud World", "The Imposter Syndrome Trap", "Healing from Within"],
  "Money & Finance": ["The Black Tax Reality", "Scarcity Mindset and You", "Budgeting for Irregular Income", "When Money Changes Friendships", "The Hustle Culture Delusion", "Redefining Wealth", "Financial Boundaries"],
  "Relationships": ["Friendships That Fade", "The Situationship Epidemic", "Setting Family Boundaries", "Love in the Digital Age", "Communication Breakdowns", "The Weight of Loyalty", "Choosing Peace Over Drama"],
  "Identity & Society": ["Who Are You Offline?", "Tribalism in Modern Spaces", "The Class Divide We Ignore", "Authenticity vs Performance", "What It Means to Belong", "Breaking Generational Curses", "The Pressure to Conform"],
  "Career & Education": ["The Degree Myth", "Workplaces Not Built for You", "Pivoting When You're Lost", "Corporate Politics 101", "The Passion vs Paycheck Dilemma", "Navigating Unemployment", "Building a Real Network"],
  "Personality & Self": ["The Introvert's Advantage", "Overthinking as a Superpower?", "The Empath's Dilemma", "Perfectionism is Exhausting", "Discovering Your Core Values", "Setting Self-Boundaries", "The Myth of Consistency"],
  "City Life": ["Nairobi: The Chaos and Charm", "Roommate Chronicles", "The True Cost of Independence", "Surviving the Commute", "Finding Quiet in the Noise", "The Loneliness of the City", "Making a House a Home"],
  "Modern Culture": ["The Algorithm's Grip", "Cancel Culture and Empathy", "The Evolution of Slang", "Art as Rebellion", "The Death of Monoculture", "Nostalgia as a Coping Mechanism", "The Attention Economy"]
};

const intros = [
  "We live in a world that constantly demands our attention, leaving little room for introspection.",
  "There comes a time in everyone's journey where the old answers stop making sense.",
  "If you look closely at the patterns in your life, you'll start to notice a recurring theme.",
  "Nobody hands you a manual for navigating the complexities of modern existence.",
  "We often mask our deepest struggles behind a veneer of casual competence.",
  "The hardest conversations are usually the ones we avoid having with ourselves.",
  "Sometimes, the most profound changes begin with a simple, quiet realization.",
  "In the rush to keep up, we rarely pause to ask if we're even running in the right direction."
];

const developments = [
  "This friction isn't accidental; it's a byproduct of a system that wasn't designed with our specific well-being in mind.\n\nWhen we push against these invisible barriers, the resistance we feel is real. It manifests in our daily choices, the boundaries we struggle to set, and the quiet exhaustion that settles in after a long day.",
  "Consider the narratives we inherited. We were taught that success is linear and that resilience means never breaking.\n\nBut true growth often requires dismantling those very beliefs. It’s about recognizing that vulnerability isn’t a flaw, but rather the foundation upon which authentic connections are built.",
  "The reality is far more nuanced. While social media paints a picture of effortless achievement, the actual process is messy, non-linear, and deeply personal.\n\nWe navigate through conflicting advice, societal pressures, and our own internal critic, trying to find a rhythm that feels sustainable.",
  "At the core of this issue is a fundamental disconnect between what we're told we should value and what actually brings us fulfillment.\n\nWe chase milestones set by others, only to arrive and feel empty. Realigning our internal compass requires a radical commitment to self-honesty."
];

const insights = [
  "The shift happens when we stop trying to fix ourselves and start trying to understand ourselves.",
  "True empowerment comes from acknowledging our limitations, not from pretending they don't exist.",
  "When we redefine success on our own terms, the external pressures begin to lose their grip.",
  "The goal isn't to eradicate the struggle, but to change our relationship with it.",
  "Realizing that you have the agency to rewrite the script is the first step toward genuine freedom."
];

const deepDives = [
  "Let’s break down how this actually plays out in real-life scenarios. Think about the last time you felt overwhelmed by a situation that seemed completely out of your control.\n\nDid you internalize the blame, or did you recognize the external factors at play? Too often, we shoulder the burden of systemic issues, mistaking societal failures for personal shortcomings.\n\nBy shifting our perspective, we can begin to untangle our self-worth from outcomes we cannot control. This requires a conscious effort to challenge the automatic negative thoughts that arise when things don't go as planned.",
  "The psychological toll of navigating these dynamics cannot be overstated. It’s a constant tightrope walk between honoring our own needs and fulfilling the expectations placed upon us by family, society, and our peers.\n\nThis balancing act drains our emotional reserves, leaving us susceptible to burnout and resentment. The key lies in developing emotional literacy—the ability to identify and articulate our feelings without judgment.\n\nWhen we name our emotions, we strip them of their overwhelming power. This practice of mindful awareness allows us to respond to stressors rather than reacting impulsively.",
  "A deeper examination reveals that our coping mechanisms are often outdated survival strategies. What kept us safe in the past may be hindering our growth in the present.\n\nFor instance, perfectionism is frequently a shield against criticism, while chronic procrastination can be a symptom of underlying anxiety. Recognizing these patterns is the first step toward dismantling them.\n\nWe must have the courage to ask ourselves: 'What purpose is this behavior serving me right now?' Once we understand the root cause, we can begin to cultivate healthier, more adaptive strategies."
];

const actions = [
  "Start by taking inventory of where your energy actually goes versus where you want it to go.",
  "Practice the art of the strategic 'no'—it's a complete sentence.",
  "Carve out small pockets of time dedicated entirely to unstructured reflection.",
  "Identify one recurring stressor and implement a tiny, manageable boundary around it today.",
  "Challenge one deeply held assumption you have about how you 'should' be living."
];

const conclusions = [
  "Ultimately, navigating this landscape is an ongoing practice, not a destination. Give yourself the grace to figure it out as you go.",
  "The journey toward clarity is paved with small, intentional choices. Start where you are, with what you have.",
  "We are all works in progress. Embracing that reality might just be the most liberating choice we can make.",
  "As we peel back the layers of expectation, what remains is the truth of who we are—and that is always enough.",
  "The path forward isn't about becoming someone new; it's about remembering who you were before the world told you who to be."
];

const honestQuestions = [
  "Where are you currently compromising your peace for the sake of someone else's comfort?",
  "What is one expectation you are holding onto that actually belongs to someone else?",
  "If you knew you couldn't fail, what boundary would you set today?",
  "What old belief about yourself is holding you back right now?",
  "Are you rushing toward a goal, or running away from a feeling?"
];

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const adjectives = ["The Hidden", "Navigating", "Understanding", "The Truth About", "Rethinking", "Surviving", "The Art of"];

// Generate all possible Title combinations to ensure 100% uniqueness
const allUniqueTopics = [];
for (const cat of categories) {
  for (const theme of themes[cat]) {
    for (const adj of adjectives) {
      allUniqueTopics.push({ category: cat, theme, title: `${adj} ${theme}` });
    }
  }
}

// Shuffle the unique topics array
for (let i = allUniqueTopics.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [allUniqueTopics[i], allUniqueTopics[j]] = [allUniqueTopics[j], allUniqueTopics[i]];
}

function generateArticle(id, isFeatured, topicData) {
  const { category, title } = topicData;
  
  // Generate a lengthy, tasty body without the forbidden phrase
  const body = `
<p>${getRandomElement(intros)}</p>

<p>${getRandomElement(developments).split('\n\n').join('</p><p>')}</p>

<h2>The Reality We Face</h2>
<p>${getRandomElement(deepDives).split('\n\n').join('</p><p>')}</p>

<blockquote>"${getRandomElement(insights)}"</blockquote>

<p>${getRandomElement(developments).split('\n\n').join('</p><p>')}</p>

<h2>Moving Forward</h2>
<p>${getRandomElement(deepDives).split('\n\n').join('</p><p>')}</p>

<p>Here are a few ways to start making a shift:</p>
<ul>
  <li><strong>Awareness:</strong> ${getRandomElement(actions)}</li>
  <li><strong>Action:</strong> ${getRandomElement(actions)}</li>
  <li><strong>Alignment:</strong> ${getRandomElement(actions)}</li>
</ul>

<p>${getRandomElement(conclusions)}</p>
  `.trim();

  // Generate a compelling excerpt
  const rawText = body.replace(/<[^>]+>/g, '').trim();
  const excerpt = rawText.substring(0, 150).trim() + "...";

  // Generate a random date within the last 2 years, or future if upcoming
  const now = new Date();
  let publishDate;
  if (isFeatured) {
    // Make it recent
    publishDate = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
  } else {
    publishDate = new Date(now.getTime() - Math.random() * 700 * 24 * 60 * 60 * 1000);
  }

  return {
    id: id.toString(),
    title: title,
    excerpt: excerpt,
    content: body,
    category: category,
    author: "BerylBytes",
    publishedAt: publishDate.toISOString(),
    isFeatured: isFeatured,
    readTime: Math.floor(Math.random() * 6) + 4, // 4-9 mins
    question: getRandomElement(honestQuestions)
  };
}

const issues = [];
// Pick the first 250 unique topic combinations
for (let i = 1; i <= 250; i++) {
  issues.push(generateArticle(i, i <= 6, allUniqueTopics[i - 1])); // Make the first 6 featured
}

// Sort by date descending
issues.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

const outputPath = path.join(__dirname, 'server', 'data', 'seed-issues.json');
fs.writeFileSync(outputPath, JSON.stringify(issues, null, 2));

console.log(`Generated ${issues.length} articles to ${outputPath}`);
