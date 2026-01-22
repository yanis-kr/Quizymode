# Building Quizymode: How I Built a Quiz App to Pass My AWS Exam (and Help My Kids Study)

*A developer's journey building a cloud-native study tool using AI coding assistants — deployed on AWS for under $20/month*

---

## Why I Built This (The Real Story)

It started with frustration.

I'm a lead developer and architect working on bank core systems transformation — the kind of work where everything moves slowly, approvals take forever, and "move fast and break things" is a fireable offense. I was grinding through AWS Solutions Architect exam prep on the side, flipping between Udemy courses, practice tests, and scattered notes. Nothing stuck the way I wanted.

Then my 14-year-old asked me to help him study Spanish, and I realized we were both struggling with the same problem: there wasn't a simple tool that let us create our own flashcards, quiz ourselves, and actually track what we'd learned.

Sure, there's Anki. There's Quizlet. But I wanted something I could customize. Something that would let me add code snippets for CLI commands. Something my kids (14 and 22) could use for their schoolwork while I used it for AWS services. And honestly? After years of building enterprise systems for other people, I wanted to build something for *myself*.

So I did. And along the way, I learned just how much AI coding assistants have changed the game.

---

## What Quizymode Actually Does

You can try it yourself at **[quizymode.com](https://www.quizymode.com/)** — it's live and free to use.

Here's what I built:

### Study Modes That Actually Work

**Explore Mode** — This is my go-to for initial learning. You see one question at a time, think about it, then reveal the answer. No pressure, no scoring. Just learning. Perfect for that first pass through new material.

**Quiz Mode** — When you're ready to test yourself, this mode randomizes questions and tracks your answers. Great for the week before an exam when you need to know what's actually sticking.

### Real Categories for Real Studying

I've been building out categories based on what I'm actually studying:

- **[AWS SAA-C03](https://www.quizymode.com/categories/aws-saa-c03)** — My Solutions Architect exam prep. Questions on VPCs, S3, Lambda, IAM policies, the works.
- **[French](https://www.quizymode.com/categories/french)** — Basic vocabulary and numbers.
- **[Spanish](https://www.quizymode.com/categories/spanish)** — Greetings and common phrases for my younger son's classes.
- **[US History](https://www.quizymode.com/categories/us-history)** — For those standardized test prep sessions.

You can browse all categories at **[quizymode.com/categories](https://www.quizymode.com/categories)**.

### Features I Actually Use Every Day

**Collections** — I group items into study sets. Right now I have a "Weak Areas" collection for AWS topics I keep getting wrong, and a "Daily Review" collection for things I want to reinforce.

**Bulk Import** — When I find a good study guide or generate questions with ChatGPT, I can import them all at once via JSON instead of typing each one manually. Huge time saver.

**Ratings & Comments** — I rate questions by how tricky they are. When studying with my kids, we add comments like "Remember: this is the same pattern as the other one."

**Code Snippets** — For AWS CLI questions, I can include actual commands in the answers. Way better than trying to describe `aws s3 sync` in plain text.

### The Smart Stuff Under the Hood

**Duplicate Detection** — This one's saved me multiple times. When you add a new question, the app uses a SimHash algorithm to find similar existing questions. Even if you word it slightly differently, it'll catch potential duplicates. No more "wait, didn't I already add this?"

**Public/Private Items** — Some questions I want to share with the community. Others (like my kids' homework prep) stay private. You control the visibility.

---

## How I Actually Built This (The AI-Assisted Way)

Here's where it gets interesting for fellow developers.

A bit of context: at my day job, we only got access to GitHub Copilot a few months ago. I'd dabbled with AI assistants before — asking ChatGPT random questions, occasionally using it to explain code — but it always felt like a neat toy, not a real tool.

Building this project changed my mind completely. It's not a toy. It's a game changer.

I built this entire application with heavy assistance from AI coding tools. Not "AI wrote it for me" — more like "AI was my incredibly patient pair programming partner who never got tired of my questions."

### Claude — My Architecture Buddy

Claude became my go-to for the hard stuff. When I was stuck deciding between Clean Architecture and Vertical Slice Architecture, I had a 30-minute conversation with Claude about tradeoffs. It helped me understand why Vertical Slices made more sense for a project this size.

I also used Claude for complex refactoring. When my codebase started getting messy around the Items feature, Claude helped me restructure it to follow SOLID principles — and actually explained *why* each change mattered. As someone who spends his day job thinking about architecture, having an AI that could discuss patterns at that level was genuinely useful.

### GitHub Copilot — The Autocomplete on Steroids

Copilot lives in my editor and handles the boring stuff. Entity Framework configurations? Copilot. API endpoint boilerplate? Copilot. Once I established a pattern for one feature, Copilot helped me replicate it consistently across others.

The test generation was surprisingly good too. I'd write one test, and Copilot would suggest variations covering edge cases I hadn't thought of.

Coming from enterprise banking where everything is locked down, having Copilot just *there* in my personal projects felt liberating.

### ChatGPT — The Research Assistant

Whenever I hit a wall with AWS configuration, ChatGPT was faster than documentation. "How do I set up Cognito for a public SPA client?" "What's the difference between access_token and id_token?" Quick answers, no hunting through docs.

### Google Gemini — The Second Opinion

Sometimes I'd get a suggestion from Claude and want a sanity check. Gemini gave me alternative perspectives, especially on React patterns and performance optimization.

### What I Still Did Myself

Let's be real: AI didn't build this app autonomously. I made all the architectural decisions — that's literally what I do for a living. I debugged the weird edge cases at 11pm. I tested everything manually before deploying. I knew what features a study app actually needed because I *am* the user.

AI is a multiplier, not a replacement. But after 20+ years of coding, this is the biggest productivity shift I've experienced since discovering Stack Overflow.

---

## The Tech Stack (For the Curious)

If you're a developer wondering what's under the hood:

### Backend: ASP.NET Core 9

I went with .NET because I know it well and it's *fast*. The new Minimal APIs in .NET 9 let me write clean endpoints without the ceremony of controllers.

- **.NET 9** with C# 12
- **Entity Framework Core 9** for database operations
- **Dapper** for the complex queries where EF Core gets in the way
- **FluentValidation** for input validation
- **Serilog** for structured logging (more on this later)

The architecture is **Vertical Slice** — meaning each feature (Items, Categories, Collections) lives in its own folder with everything it needs: endpoints, handlers, DTOs, validations. When I need to change how ratings work, I go to `/Features/Ratings/` and everything's there. No more bouncing between Controllers, Services, and Repositories folders.

### Frontend: React 19 + TypeScript

- **React 19** with TypeScript (because I like catching errors at compile time)
- **Vite** for builds (so fast compared to webpack)
- **TanStack React Query** for server state management
- **Tailwind CSS 4** for styling
- **React Hook Form + Zod** for forms and validation
- **AWS Amplify** for the Cognito integration

TanStack Query deserves a special mention. It handles all the caching, refetching, and loading states that I used to write manually. Game changer.

### Database: PostgreSQL on Supabase

Supabase gives you a free PostgreSQL database with 500MB storage. For a side project, that's plenty. The JSONB support in Postgres is handy for flexible data storage without schema changes.

### Authentication: AWS Cognito

User pools with OAuth 2.0. Users can sign up with email, reset passwords, and I can assign admin privileges through Cognito groups. The free tier is generous enough that I've never paid for auth.

---

## The Infrastructure (How I Keep It Under $20/Month)

One of my goals was keeping this cheap. Here's exactly what I'm paying and how I set it up, in the order you'd actually do it:

### 1. Buy a Domain — Cloudflare ($10.46/year)

I registered `quizymode.com` through Cloudflare. They sell domains at cost (no markup) and you get free SSL, DDoS protection, and CDN. Win-win.

### 2. Set Up the Database — Supabase (Free)

Supabase gives you a free PostgreSQL database with 500MB storage. For my use case, that's more than enough. Create a project, grab the connection string, done.

### 3. Configure Authentication — AWS Cognito (Free Tier)

This took some trial and error, but Cognito handles all the auth stuff I didn't want to build myself:
- User sign-up and sign-in
- Password reset flows
- OAuth 2.0 tokens for the API
- Admin groups for privileged operations

The free tier is 50,000 monthly active users. I'm... not there yet.

### 4. Host the Frontend — S3 + CloudFront (A Few Cents)

The React app gets built into static files and uploaded to S3. CloudFront sits in front as a CDN, serving everything fast and handling HTTPS.

**Pro tip for SPAs**: Configure CloudFront error pages to redirect 404s to `index.html`. Otherwise React Router won't work when someone refreshes the page.

### 5. Get an SSL Certificate — AWS Certificate Manager (Free)

Request a certificate for your domain. It's free when used with CloudFront. Just validate domain ownership and you're good.

### 6. Set Up CI/CD — GitHub Actions (Free)

Every push to `main` triggers the pipeline:

```yaml
# The important bits
- run: dotnet test          # Run tests first
- uses: docker/build-push-action@v6
  with:
    push: true
    tags: ghcr.io/yanis-kr/quizymode:latest
```

Tests run, Docker image gets built, and it pushes to GitHub Container Registry. All free for public repos.

### 7. Run the API — Lightsail Container Service ($7/month)

This is the only thing that actually costs money monthly. Lightsail's Nano instance (512MB RAM, 0.25 vCPUs) runs the .NET API in a container. It's not beefy, but it handles my traffic fine.

Deployment is just pointing Lightsail at my GHCR image and hitting deploy.

### 8. Deploy the Frontend — PowerShell Script

I wrote a script that builds the React app, syncs it to S3, and invalidates the CloudFront cache:

```powershell
npm run build
aws s3 sync dist s3://quizymode-web/ --delete
aws cloudfront create-invalidation --distribution-id EH1DS9REH8KR5 --paths "/*"
```

One command, everything's deployed.

### Total Monthly Cost

- Lightsail: **$7/month**
- Domain: **$10.46/year** (works out to ~$0.87/month)
- Everything else: **Free**

**Total: ~$8/month** — less than a Netflix subscription for a full production application.

---

## Two Features I'm Proud Of

### Duplicate Detection That Actually Works

You know that feeling when you add a flashcard and think "wait, did I already have this one?" Yeah, that happened to me constantly.

So I implemented **SimHash** — a locality-sensitive hashing algorithm. When you add a new question, the system:

1. Normalizes the text (lowercase, clean up whitespace)
2. Breaks it into word pairs ("shingles")
3. Computes a 64-bit signature
4. Compares against existing questions

The magic is that similar questions produce similar signatures, even if you worded them differently. "What is S3?" and "What's Amazon S3?" will flag as potential duplicates.

It's not perfect, but it catches 90% of the duplicates I would've created otherwise.

### Observability with Grafana Cloud

I added full observability because I wanted to actually know what was happening in production:

- **Logs** go to Grafana Loki (via Serilog)
- **Metrics** like request duration go to Prometheus
- **Traces** show the full request path via OpenTelemetry

When something breaks at 11pm (and it will), I can actually see what happened instead of guessing.

---

## What I Learned Along the Way

**AI is a multiplier, not a magic wand.** The developers who will benefit most from AI tools are the ones who already know how to code. AI amplifies your existing skills — it doesn't replace them.

**Side projects don't have to cost much.** Cloud services have gotten incredibly cheap for small-scale projects. If you're paying $50+/month for a hobby project, you're probably overengineering it.

**Build what you'll actually use.** The reason this project got finished (unlike my graveyard of abandoned repos) is that I use it every day. My sons use it. We have real skin in the game.

**Vertical Slice Architecture is underrated.** Organizing code by feature instead of by layer made everything more navigable. When I need to fix something in ratings, I go to one folder and everything's there.

---

## What's Coming Next

I'm not done building. Here's what's on my roadmap:

### AI-Powered Question Generation

The next big feature: upload a study guide or PDF, and have an LLM generate quiz items automatically. You'd review and edit them before saving, but imagine dumping an AWS whitepaper and getting 50 relevant questions in minutes.

### RAG Support for Premium Users

Eventually, I want to implement Retrieval-Augmented Generation. Upload your reference materials, and the system will generate questions grounded in *your specific content*. Not generic questions — questions about the exact topics in your study guide.

---

## Give It a Try

I built this for myself, but it's live for anyone to use:

**[quizymode.com](https://www.quizymode.com/)** — Create an account, add some flashcards, and see if it helps your studying.

A few links to get you started:
- **[Browse all categories](https://www.quizymode.com/categories)** — See what's already there
- **[AWS SAA-C03 prep](https://www.quizymode.com/categories/aws-saa-c03)** — My Solutions Architect exam questions
- **[French vocabulary](https://www.quizymode.com/categories/french)** — Basic vocab for beginners
- **[Explore mode](https://www.quizymode.com/explore)** — Start studying immediately

The source code is on GitHub if you want to peek under the hood: **[github.com/yanis-kr/Quizymode](https://github.com/yanis-kr/Quizymode)**

---

## Final Thoughts

A year ago, building a full-stack application with authentication, a REST API, a React frontend, CI/CD, and cloud deployment would've taken me months of nights and weekends — time I don't have between a demanding day job and two kids.

With AI assistants, I got it done in weeks.

That's not because AI wrote the code for me. It's because AI handled the tedious parts — the boilerplate, the "how do I configure X again?", the rubber-duck debugging — and let me focus on the parts that actually matter: what to build and why.

I've been writing code professionally for over two decades. I've seen a lot of "this changes everything" technologies come and go. But AI-assisted development? This one's real. It's not replacing developers — it's making us dramatically more effective.

If you've been putting off a side project because it feels too big, now's the time. The tools have never been better.

Now if you'll excuse me, I have an AWS exam to study for. 📚

---

*Have questions about the implementation? Find a bug? Want a new feature? Drop me a comment or open an issue on GitHub.*

---

**Tags**: #AWS #AWSSAA #DotNet #React #AIAssistedDevelopment #SideProject #CloudNative #StudyTools #Flashcards #LearnToCode
