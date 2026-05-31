import fs from 'fs';

const categories = [
  "Mental Health", "Money", "Relationships", "Identity", "Career & Education", "Personality", "City Life", "Growth"
];

const titlePrefixes = [
  "The Hidden Cost of", "Why We Are Exhausted By", "The Reality Behind", "Navigating", "The Unspoken Truth About", 
  "Surviving", "The Illusion of", "Breaking Free From", "The Psychology of", "When You Can No longer Afford", 
  "The Burden of", "Redefining", "The Silent Epidemic of", "Why Nobody Talks About", "The Dark Side of"
];

const titleSubjects = [
  "Nairobi's Hustle Culture", "Modern Dating", "Family Expectations", "Black Tax", "Corporate Ladders",
  "Instagram Aesthetics", "Weekend Spending", "Performative Success", "Adult Friendships", "Side Hustles",
  "Career Pivots", "Renting in Kilimani", "Emotional Labor", "Toxic Positivity", "The 'Soft Life' Trend",
  "Overworking", "Financial Independence", "Generational Trauma", "The Wedding Industry", "Keeping Up Appearances"
];

const titleSuffixes = [
  "And How It's Breaking Us", "In Your Thirties", "When You're Broke", "And Why Nobody Talks About It", 
  "In The Age of Social Media", "And What It Actually Costs", "Before It's Too Late", "While Trying to Stay Sane",
  "And Why It's Okay to Fail", "Without Losing Yourself", "In Modern Kenya", "And Why We Need to Stop"
];

const bodyParagraphs = [
  "<p>We live in a city that demands performance. You step out of your house, and immediately, you are on stage. The pressure to look like you're succeeding is often heavier than the effort it takes to actually succeed.</p>",
  "<p>Behind closed doors, the reality is stark. Mobile loan apps are pinging, credit cards are maxed out, and people are silently drowning while trying to maintain an aesthetic. It's a vicious cycle where we spend money we haven't earned, to impress people we don't even like.</p>",
  "<p>The only way out is radical honesty. It's okay to say, 'I can't afford this right now.' It's okay to stay in on a Friday. The moment you stop competing in the optics Olympics, you reclaim your peace, and more importantly, you reclaim your financial future.</p>",
  "<p>In your early twenties, things were effortless. Proximity did the heavy lifting. You were all broke, all confused, and all in the same place. Now, you have to cross three counties just to grab a cup of coffee, and even then, everyone is looking at their phones.</p>",
  "<p>We use 'busy' as a shield. Being busy has become a status symbol in Nairobi. If you're not busy, you're not important. But hiding behind busyness is exactly what starves our connections. We are so focused on building our lives that we forget to share them.</p>",
  "<p>We've glorified the grind to a point where resting feels like a moral failure. If you're not monetizing your weekend, you feel guilty. If your hobby isn't generating passive income, it feels like a waste of time. We are replacing our lives with our livelihoods.</p>",
  "<p>We tell ourselves that we'll rest 'someday.' When we hit a certain financial milestone, when the mortgage is paid, when the kids are through school. But the finish line keeps moving. The goalpost is an illusion. We are sacrificing our present peace for a future that is entirely unguaranteed.</p>",
  "<p>The paradox of choice has paralyzed us. With thousands of potential options in our pockets, we are terrified to commit. What if there's someone or something better just one swipe away? We treat people and opportunities like disposable commodities.</p>",
  "<p>We are terrified of being 'the one who cares more.' So we play games. We wait three hours to reply to a text. We pretend we aren't bothered when plans are canceled. This emotional armor protects us from rejection, but it also entirely prevents deep connection.</p>",
  "<p>We were sold a very linear dream: Go to school, get good grades, secure a corporate job, and climb the ladder until retirement. But nobody warned us about what happens when you reach the middle of the ladder and realize it's leaning against the wrong wall.</p>",
  "<p>The biggest barrier to pivoting is the sunk cost fallacy. 'I've already invested five years in this. I can't throw it away.' But staying in a miserable situation simply because you've spent a long time being miserable is a terrible strategy for your life.</p>",
  "<p>Starting over is terrifying. It often means taking a pay cut, becoming a beginner again, and facing the judgment of peers who don't understand. But the discomfort of transition is temporary; the regret of staying stagnant is permanent.</p>",
  "<p>The cultural expectation to 'give back' is slowly crushing an entire generation. Black tax isn't just a financial burden; it's a profound emotional weight. You are expected to build your life while simultaneously funding the lives of those who came before you.</p>",
  "<p>We are a generation that is over-educated, underpaid, and deeply anxious. We have access to more information than any humans in history, yet we feel completely lost. The noise of the internet makes it impossible to hear our own intuition.</p>",
  "<p>We constantly romanticize the 'soft life,' but nobody talks about the hard boundary-setting required to achieve it. You cannot have a soft life with weak boundaries. You cannot protect your peace if you are constantly available to everyone's emergencies.</p>",
  "<p>Social media has completely warped our baseline for reality. We are comparing our behind-the-scenes struggles with everyone else's highlight reels. The result is a pervasive feeling of inadequacy, no matter how much you actually achieve.</p>"
];

const excerptTemplates = [
  "Everyone seems to be doing better than you. Here is what they aren't telling you about the silent struggles behind closed doors.",
  "You have 400 contacts, but no one to call at 3 AM. The modern world is making us more connected, yet deeply isolated.",
  "You are working 60 hours a week and you're still exhausted. The gospel of grinding is breaking an entire generation.",
  "Finding genuine connection in a city of millions has never felt more isolating or impossible. Here is why we are struggling.",
  "You studied for four years, got the degree, and now you realize you hate the life you built. It's time to pivot.",
  "The unspoken rules of our culture are slowly draining our bank accounts and our peace of mind.",
  "Why the pursuit of an aesthetic lifestyle is leaving us deeply unfulfilled and financially stressed.",
  "We are sacrificing our present happiness for a future that is entirely unguaranteed. It's time to stop the cycle."
];

const questions = [
  "How much are you spending just to prove you are okay?",
  "When was the last time you saw your best friend without having to 'schedule' it?",
  "Is your hustle building your life, or replacing it?",
  "Are you looking for connection, or just someone to fill the silence?",
  "Are you staying in your career because you love it, or because you're afraid to start over?",
  "When did you stop living for yourself and start living for the internet?",
  "What would you do today if you knew you couldn't fail?",
  "Are your boundaries actually protecting your peace, or just keeping people out?",
  "Who are you when you strip away your job title and your bank balance?"
];

const generatedIssues = [];
const usedTitles = new Set();

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate 250 unique articles
for (let i = 0; i < 250; i++) {
  let title = "";
  // Ensure completely unique titles
  while (true) {
    const prefix = getRandom(titlePrefixes);
    const subject = getRandom(titleSubjects);
    const suffix = Math.random() > 0.5 ? " " + getRandom(titleSuffixes) : "";
    title = prefix + " " + subject + suffix;
    if (!usedTitles.has(title)) {
      usedTitles.add(title);
      break;
    }
  }

  const category = getRandom(categories);
  const uniqueId = String(250 - i).padStart(3, '0');
  
  const day = Math.floor(Math.random() * 28) + 1;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[Math.floor(Math.random() * 12)];
  const year = 2026 - Math.floor(i / 20);
  
  const excerpt = getRandom(excerptTemplates);
  const question = getRandom(questions);
  
  // Pick 3-5 random paragraphs to construct unique content
  const numParagraphs = Math.floor(Math.random() * 3) + 3;
  let content = "";
  let availableParagraphs = [...bodyParagraphs];
  
  for (let j = 0; j < numParagraphs; j++) {
    const pIndex = Math.floor(Math.random() * availableParagraphs.length);
    content += availableParagraphs[pIndex] + "\\n";
    availableParagraphs.splice(pIndex, 1);
  }
  
  // Add a random subheading to break up the text
  content = content.slice(0, content.indexOf("</p>") + 4) + "\\n<h3>The Turning Point</h3>\\n" + content.slice(content.indexOf("</p>") + 4);

  generatedIssues.push({
    id: uniqueId,
    title: title,
    category: category,
    date: month + " " + day + ", " + year,
    readTime: (Math.floor(Math.random() * 8) + 5) + " min read",
    excerpt: excerpt,
    question: question,
    content: content
  });
}

const fileContent = "export const initialIssues = " + JSON.stringify(generatedIssues, null, 2) + ";";

fs.writeFileSync('src/data/issues.js', fileContent);
console.log('Successfully generated 250 unique articles with varying topics in src/data/issues.js');
