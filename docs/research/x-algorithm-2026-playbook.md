# xAI X Algorithm — SkillOS Engagement Playbook

*Source: github.com/xai-org/x-algorithm @ `0bfc2795d308f90032544322747caacd535f75ae` (2026-05-15 21:54:59 +0000 UTC)*
*Compiled: 2026-05-16 (read-only audit, no repo modifications)*

---

## Executive summary

The 2026-05-15 xAI release is a *new* For You algorithm — substantially different from the 2024 Twitter open-source. The pipeline is now Rust (home-mixer), JAX/Python (Phoenix two-tower retrieval + transformer ranker), and Python (Grox content classifiers using vision-language models). Critically: **xAI shipped the formulas but stripped every numeric tuning constant**. `crate::params` is referenced throughout the Rust code but the params module itself is not present in the public release; weights flow from a runtime feature-switch system at xAI. **Assume xAI maintains private ranking layers (botmaker safety rules, ad-adjacency policy, in-house spam thresholds for low-follower accounts) on top of what is shipped.** What we DO get: the exact signal list the model predicts, the explicit cold-start logic, the brand-safety verdict gates, and the structural rules that govern whether a post survives to ranking at all. That's enough to build a defensible playbook even without coefficients.

---

## §1 Engagement weight hierarchy

The "Weighted Scorer" computes `Final Score = Σ (weight_i × P(action_i))` over the Phoenix transformer's per-candidate predictions. Every weight constant is **referenced as a runtime param** at `home-mixer/scorers/ranking_scorer.rs:42-66` via `xai_feature_switches::Params` — none are compile-time constants in the public source.

| Signal (ML prediction) | Param name (runtime) | Source file:line | Relative magnitude vs P(favorite) |
|---|---|---|---|
| `favorite_score` (Like) | `FavoriteWeight` | `home-mixer/scorers/ranking_scorer.rs:43` | baseline (1.0×) |
| `reply_score` | `ReplyWeight` | `home-mixer/scorers/ranking_scorer.rs:44` | **not in public repo** |
| `retweet_score` (Repost) | `RetweetWeight` | `home-mixer/scorers/ranking_scorer.rs:45` | **not in public repo** |
| `photo_expand_score` | `PhotoExpandWeight` | `home-mixer/scorers/ranking_scorer.rs:46` | **not in public repo** |
| `click_score` (tap-into post) | `ClickWeight` | `home-mixer/scorers/ranking_scorer.rs:47` | **not in public repo** |
| `profile_click_score` | `ProfileClickWeight` | `home-mixer/scorers/ranking_scorer.rs:48` | **not in public repo** |
| `vqv_score` (video quality view) | `VqvWeight` (gated: requires `min_video_duration_ms > MinVideoDurationMs`) | `home-mixer/scorers/ranking_scorer.rs:49,132-137` | **not in public repo** |
| `share_score` | `ShareWeight` | `home-mixer/scorers/ranking_scorer.rs:50` | **not in public repo** |
| `share_via_dm_score` | `ShareViaDmWeight` | `home-mixer/scorers/ranking_scorer.rs:51` | **not in public repo** |
| `share_via_copy_link_score` | `ShareViaCopyLinkWeight` | `home-mixer/scorers/ranking_scorer.rs:52` | **not in public repo** |
| `dwell_score` (binary "did dwell") | `DwellWeight` | `home-mixer/scorers/ranking_scorer.rs:53` | **not in public repo** |
| `dwell_time` (continuous, post-level) | `ContDwellTimeWeight` | `home-mixer/scorers/ranking_scorer.rs:57,163` | **not in public repo** |
| `click_dwell_time` (continuous, after tap-in) | `ContClickDwellTimeWeight` | `home-mixer/scorers/ranking_scorer.rs:58,164` | **not in public repo** |
| `quote_score` | `QuoteWeight` | `home-mixer/scorers/ranking_scorer.rs:54` | **not in public repo** |
| `quoted_click_score` | `QuotedClickWeight` | `home-mixer/scorers/ranking_scorer.rs:55` | **not in public repo** |
| `quoted_vqv_score` (quoted video view) | `QuotedVqvWeight` (gated like `vqv`) | `home-mixer/scorers/ranking_scorer.rs:56,139-144` | **not in public repo** |
| `follow_author_score` | `FollowAuthorWeight` | `home-mixer/scorers/ranking_scorer.rs:59` | **not in public repo** |

**Notes:**
- `Click` here means *tap-to-expand the post inside the For You feed*, NOT external link click. External link clicks are not a separate prediction head in the public model. (`home-mixer/scorers/weighted_scorer.rs:53`).
- The two `dwell` channels (binary `dwell_score` + continuous `dwell_time`/`click_dwell_time`) means dwell is double-counted: you get scored on *whether* you dwelled AND *how long*. Dwell-time signals are unusually load-bearing.
- The deprecated `WeightedScorer` (the older path at `home-mixer/scorers/weighted_scorer.rs`) shipped 18 of these predictions; the newer `RankingScorer` adds `not_dwelled`, `cont_click_dwell_time`, and `quoted_vqv` — the model now scores "did NOT dwell" as an explicit penalty (see §2).

**Constant-name evidence (used directly in code, not via params):**
- `NEGATIVE_SCORES_OFFSET` — added to push the final post-blend score above zero. Referenced unqualified at `home-mixer/scorers/ranking_scorer.rs:179,181` (definition stripped).
- `NEW_USER_OON_WEIGHT_FACTOR` — `home-mixer/scorers/ranking_scorer.rs:235` (definition stripped).
- `NEW_USER_MIN_FOLLOWING` — `home-mixer/scorers/ranking_scorer.rs:232` (definition stripped).

---

## §2 Penalty signals

These are the prediction heads with **explicitly negative weights** in `negative_sum` at `home-mixer/scorers/ranking_scorer.rs:83`:

| Signal | Param name | Source file:line | Notes |
|---|---|---|---|
| `not_interested_score` | `NotInterestedWeight` | `home-mixer/scorers/ranking_scorer.rs:60,166` | Predicted P(user taps "Not interested") |
| `block_author_score` | `BlockAuthorWeight` | `home-mixer/scorers/ranking_scorer.rs:61,167` | Predicted P(block) |
| `mute_author_score` | `MuteAuthorWeight` | `home-mixer/scorers/ranking_scorer.rs:62,168` | Predicted P(mute) |
| `report_score` | `ReportWeight` | `home-mixer/scorers/ranking_scorer.rs:63,169` | Predicted P(report) |
| `not_dwelled_score` | `NotDwelledWeight` | `home-mixer/scorers/ranking_scorer.rs:64,170` | **NEW vs 2024** — explicit "skipped past" penalty |

**Hard filter-level penalties (drop, not downrank):**

| Filter | Effect | Source file:line |
|---|---|---|
| `AuthorSocialgraphFilter` | Drop if viewer blocked/muted author OR author blocks viewer (covers retweeted/quoted authors too) | `home-mixer/filters/author_socialgraph_filter.rs:46-52` |
| `MutedKeywordFilter` | Drop if tweet-tokens match viewer's muted-keyword tokens (token-sequence match, not substring) | `home-mixer/filters/muted_keyword_filter.rs:46-50` |
| `AgeFilter` | Drop if older than `MAX_POST_AGE` runtime param | `home-mixer/filters/age_filter.rs:17-21` |
| `VFFilter` (Visibility Filter) | Drop if `safety_result.action == Drop(_)` OR any non-None FilteredReason | `home-mixer/filters/vf_filter.rs:22-29` |
| `PreviouslySeenPostsFilter` + `PreviouslyServedPostsFilter` | Drop posts already shown to user | `home-mixer/filters/` (mod.rs) |

**Brand-safety verdict (downgrade, ads gate):**
- `BrandSafetyVerdict::MediumRisk` is assigned at `home-mixer/models/brand_safety.rs:42-55` if ANY of 14 safety labels apply (NSFW high-precision/recall, NSFA HP, GORE_AND_VIOLENCE HP, NSFW_REPORTED, GORE_REPORTED, NSFW_CARD_IMAGE, DO_NOT_AMPLIFY, NSFA_COMMUNITY_NOTE, PDNA, EGREGIOUS_NSFW, GROK_NSFA, NSFW_TEXT, plus PTOS-cutoff-not-reviewed).
- **Hidden trap (`home-mixer/models/brand_safety.rs:47-51`)**: if post is NOT scored by Grok yet (`GROK_SFA` / `GROK_NSFA_LIMITED` labels absent), it defaults to `MediumRisk`. **Fresh posts have a classifier-coverage delay window where they are treated as risky until Grok labels arrive.**
- **PTOS cutoff** (`brand_safety.rs:37,53`): tweets with ID `≥ 2_054_275_414_225_846_272` (≈ recent 2026 cutoff per Twitter snowflake epoch decoding) **require** a `PTOS_REVIEWED` label or are auto-`MediumRisk`. Most recent posts go through an extra review step.
- BotMaker rule categories (`brand_safety.rs:78-86`): 1000-1099 Content, 1100-1199 ContentLimited, 1200-1399 Safety, 1400-1499 Grok, 1500-1600 Quote — private rule IDs but the category split confirms a separate "Quote" enforcement track for QTs.

**Grox-stage hard rejections (Python VLM gate before ranking sees the post):**
- `SafetyPtosPolicyClassifier` enforces 7 hard policy categories: `ViolentMedia`, `AdultContent`, `Spam`, `IllegalAndRegulatedBehaviors`, `HateOrAbuse`, `ViolentSpeech`, `SuicideOrSelfHarm` (`grox/classifiers/content/safety_ptos.py:217-225`). Any violation → drop.
- **Low-follower accounts get a separate, stricter spam classifier**: `SpamEapiLowFollowerClassifier` with prompt template `SpamSystemLowFollower` (`grox/classifiers/content/spam.py:10,25`). Confirms structurally that low-follower posters face a different bar than established accounts.

**Quality gate (downrank, not drop):**
- `BangerInitialScreenClassifier` (`grox/classifiers/content/banger_initial_screen.py`) runs every post through a Grok VLM and outputs:
  - `quality_score` (0-1) — threshold `≥ 0.4` marks the post as "banger" positive (line 129).
  - `slop_score` (int) — explicit AI-generated low-effort detection.
  - `has_minor_score` — minors-in-content detector.
  - `taxonomy_categories` — topic tagging.
- Below the 0.4 banger threshold, posts are NOT dropped but lose visibility lift.

---

## §3 Content composition recommendations

Each tied to a code-evidenced mechanism, NOT to a weight magnitude (since those are private).

1. **Front-load substance — fight the dwell-time double-count.**
   `home-mixer/scorers/ranking_scorer.rs:53,57` shows dwell is scored TWICE: once as binary `dwell_score` (did the user pause at all) and once as continuous `cont_dwell_time` (how long). A post that gets a scroll-past is penalized via `not_dwelled_score` (`ranking_scorer.rs:64,170`) AND loses the dwell contribution. **First sentence must stop the scroll.** No throat-clearing intros, no "hot take incoming" preambles. For SkillOS this means: lead with the technical fact, the address, the price, the diff — not the framing.

2. **Optimize for reply over like — and especially over retweet.**
   The model has a separate `ReplyWeight` AND a separate `QuoteWeight` AND a separate `RetweetWeight` (`ranking_scorer.rs:44,45,54`). Quote and reply require composition effort and create dwell-time on the *engager* (boosting your tweet through their feed too). Pose explicit, answerable questions (vs. rhetorical). Ask for a counter-example, a price, a benchmark, a one-line response — anything that's faster to type than to skip.

3. **Use video if and only if it clears the duration gate.**
   `weighted_scorer.rs:72-81` and `ranking_scorer.rs:132-137`: `vqv_weight` is zero-applied when `video_duration_ms <= MinVideoDurationMs`. There is a runtime-configured minimum duration below which video gets NO video-quality-view credit. Bucket boundaries in `tweet_type_metrics_hydrator.rs:84-92` show the model distinguishes `VIDEO_LTE_10_SEC`, `VIDEO_BT_10_60_SEC`, `VIDEO_GT_60_SEC` as features. Don't post 5-second clips for engagement — they don't earn vqv. Either skip video or commit to a real one.

4. **Profile-click is a first-class signal — make your handle worth clicking.**
   `ranking_scorer.rs:48` — `ProfileClickWeight` is a top-line weight, not a side metric. Your *bio and pinned post* are part of the ranking surface: users tapping through to your profile generates `profile_click_score` for every post that drove that tap. A clear bio + a pinned that delivers on the bio's promise compounds across every post you ship.

5. **Compose for share-via-DM, not just retweet.**
   `ranking_scorer.rs:51,52` splits `ShareViaDmWeight` and `ShareViaCopyLinkWeight` from `ShareWeight` (the "share sheet" action). DM-share is a separate prediction head. This means content optimized for "I need to send this to my friend who's been struggling with X" beats content optimized for "I want everyone to see this." Specificity wins: name the persona who'd send it, name what they'd say sending it. For SkillOS: technical demos and debugging walkthroughs DM further than mission statements.

---

## §4 New account warmup tactics

The code-evidenced new-account model is **richer than a simple suppression**: it's a separate ML cluster, a separate retrieval cluster, and a stricter spam classifier — gated on age AND following-count thresholds.

**Two-axis new-user eligibility** (`home-mixer/scorers/ranking_scorer.rs:227-238`):
```
is_eligible_new_user = (account_age < NewUserAgeThresholdSecs)
                    && (followed_user_ids.len() >= NEW_USER_MIN_FOLLOWING)
```
- If both true → eligible → use `NEW_USER_OON_WEIGHT_FACTOR` (separate OON multiplier).
- If age is over the threshold but you have low engagement history → you fall *off* the new-user warmup track and get scored by the regular model with no breaks.

**Separate model clusters at scoring AND retrieval:**
- Scoring (`phoenix_scorer.rs:29-43`): if `scoring_sequence.length < PhoenixRankerNewUserHistoryThreshold` → routed to `PhoenixRankerNewUserInferenceClusterId` (separate ranking model trained for cold-start).
- Retrieval (`phoenix_source.rs:25-38`): same logic with `PhoenixRetrievalNewUserHistoryThreshold` → `PhoenixRetrievalNewUserInferenceClusterId`. New users get a *different candidate pool* too.

**Topic gate for new users** (`filters/new_user_topic_ids_filter.rs:10-27`):
- When `EnableNewUserTopicFiltering` is on and you have selected topic interests, you only see in-network posts OR posts in those topics. **The topics you pick at onboarding aggressively shape your feed for the new-user window.**

**Low-follower spam classifier** (`grox/classifiers/content/spam.py:10,25`):
- `SpamEapiLowFollowerClassifier` uses a special system prompt (`SpamSystemLowFollower`) for low-follower accounts. **Your posts go through a stricter spam-detection LLM than a 100k-follower account's posts do.** This is not down-ranking; this is harder pre-classification with no shipped threshold but plausibly a lower confidence bar to label-as-spam.

**Actionable new-account warmup (ToS-safe, code-evidenced):**

1. **Hit `NEW_USER_MIN_FOLLOWING` before posting much.** Follow ≥ the threshold of high-relevance accounts in your niche on day 1 — this is one of the two gates into the favorable new-user OON factor. Without it, you forfeit the new-user lift.
2. **Pick onboarding topic interests precisely.** They're used by `NewUserTopicIdsFilter` to shape your feed, which trains the user-action-sequence the ML uses to predict what *similar users like you* would engage with on your posts. Picking "Tech / AI / Crypto" calibrates your retrieval surface; picking 50 random topics dilutes it.
3. **Build a tiny banger backlog before posting publicly.** The `banger_initial_screen` runs on every post (`banger_initial_screen.py`). A new account with the first 3-5 posts at `quality_score >= 0.4` builds a positive priors signal in your authorship history. A new account whose first 5 posts are sub-0.4 sloppy text gets a worse priors trajectory.
4. **Avoid spam-classifier landmines for the first 30 days.** Repeated identical replies, link-only posts, posts with no original content composed only of mentions, posts that hard-pitch — these are exactly what `SpamSystemLowFollower` is tuned to catch. The strict classifier ramp lifts once your follower bucket clears.
5. **Generate first-engagements from accounts whose followers overlap with yours.** The `MutualFollowJaccardHydrator` (see §5) computes a Jaccard similarity between viewer's and author's mutual-follow MinHash. Engagement from accounts whose audiences overlap with yours has more downstream lift than engagement from random high-follower accounts — because the Jaccard signal feeds candidate ranking *for those overlapping audiences*.

---

## §5 Cross-promotion: mention vs DM vs RT chain

The public code does NOT contain a "mention recipient unfamiliar penalty" constant. There's no equivalent of the 2024-era "out-of-network reply penalty by recipient-interaction-history." What replaces it:

**Mutual-follow Jaccard hydration** (`home-mixer/candidate_hydrators/mutual_follow_jaccard_hydrator.rs:16-23,89-113`):
- Computes a MinHash-based Jaccard similarity between the **viewer's followed-set** and the **post author's followed-set** (signature requires `≥ 256 minhashes`).
- This value is stored as `mutual_follow_jaccard` on the candidate and is plausibly fed into the Phoenix ranker as a feature (the V/M ranker at `vm_ranker.rs:102` consumes `author_followers_count`; the broader ML feature surface is private, but the hydrator's only purpose is to feed downstream scoring).
- **Implication**: mentioning, replying-to, or being retweeted by an account whose *followed-set overlaps yours* (not just any popular account) is the load-bearing signal. Big accounts whose audiences are nothing like yours give you less lift than mid-sized accounts whose audiences overlap.

**Following-replied-users facepile** (`candidate_hydrators/following_replied_users_hydrator.rs:12,35-41`):
- `const VIEWER_FOLLOWERS_THRESHOLD: i64 = 1000` — viewers with ≥1000 followers get the "X people you follow replied to this" facepile annotation on root tweets they're shown.
- This is a viewer-side feature, BUT it means: **root tweets that get replies from accounts followed by 1000+-follower viewers get a visible social-proof surface** in those viewers' feeds. Getting a reply from a connector account (whose viewers tend to be 1000+ follower-counted themselves) compounds.

**Push-to-home distribution** (`sources/push_to_home_source.rs:10,71-96`):
- When a tweet is "pushed to home" (e.g. via notification path), the system fetches up to `MAX_REPLIERS = 3` top scored replies from the viewer's *followed* accounts to display alongside.
- **Implication**: if you reply quickly and substantively to high-distribution root tweets posted by accounts followed by your target audience, your reply has a meaningful chance of being among the 3 selected for the push-to-home facepile.

**DM share is a separate prediction head** (`ranking_scorer.rs:51`):
- `share_via_dm_score` is its own term in the weighted sum, distinct from `share_via_copy_link` and `share`.
- **Implication**: encouraging DM-share is meaningfully different from encouraging RT or copy-link. Build artifacts (gists, code snippets, deployable demos) that are easier to DM ("look at this") than to QT.

**No evidence found** for:
- A "mention spam" penalty by recipient-interaction-history (was present in 2023-era Twitter open-source, not in this 2026 release).
- A direct multiplier for retweet chains (the model scores reposts as a single action, no chain-depth bonus).
- A "@mention bomb" filter — but the low-follower spam classifier (§4) may catch it as spam.

**Cross-promo tactical guidance:**
- Reply meaningfully to mid-sized accounts whose followed-set overlaps yours. Bigger ≠ better.
- Compose for DM-share, not just retweet. A code snippet wins a DM; a manifesto wins a like.
- A QT with new analysis beats a bare RT. `quote_score` and `quoted_click_score` are separate prediction heads; bare RT gets only `retweet_score`.

---

## §6 SkillOS-specific 5-bullet playbook

ToS-safe, voice-consistent (technical, direct, no hype), and aligned to mechanisms confirmed in the May 15 2026 source.

1. **Ship product-state, not product-claims.** Post the address, the diff, the failing test, the chain-verified proof. Code-evidenced: `dwell_score` + `cont_dwell_time` double-count means scroll-stopping substance wins (`ranking_scorer.rs:53,57`). Every post should be one of: a deployed contract address, a working CLI command, a chart of real on-chain numbers, a one-paragraph technical explainer of a real bug fix. No "we believe" posts.

2. **Build the bio and pin for `profile_click_score`.** `ProfileClickWeight` is a top-line ranking signal (`ranking_scorer.rs:48`). Bio = one-line problem statement + a verifiable artifact link (chain explorer, GitHub, deployed site). Pinned post = the single best technical demo of what SkillOS does. Refresh the pinned every meaningful shipped milestone.

3. **Quote-with-analysis the right neighbors, not the biggest accounts.** Use `mutual_follow_jaccard` thinking (`mutual_follow_jaccard_hydrator.rs:16-23`): quote-post agent-tech / on-chain-infra / dev-tooling accounts whose followers plausibly overlap with the SkillOS target persona. Each QT must add a technical observation — that triggers `quote_score` + `quoted_click_score` + invites a reply from the original author. Avoid bare RTs unless the source is canonical (xAI's own announcements, base.dev, etc.).

4. **Don't post videos under 10 seconds.** `tweet_type_metrics_hydrator.rs:84-92` splits video by duration buckets; the `vqv` weight is gated on a runtime minimum (`weighted_scorer.rs:72-81`). Short loops earn no video-quality-view credit. Either ship a 30-60s technical walkthrough or stick to text+screenshot. No 5-second teaser clips.

5. **Use the 24-hour engagement window deliberately.** `tweet_type_metrics_hydrator.rs:98-112` shows the model tags posts by age bucket (≤30min, ≤1hr, ≤6hr, ≤12hr, ≥24hr). Posts ≥24h old get the `TWEET_AGE_GTE_24_HOURS` type, which probably correlates with reduced ranker priority in regular flows. Plan high-stakes posts (mainnet ship, milestone announcement) for windows where you can babysit replies for ~6 hours — every reply you give in that window generates engagement signals that compound. Once a post passes 24h, don't expect further organic lift; ship the next thing instead.

**Anti-patterns to avoid (code-evidenced):**
- Posting before Grok safety-labels arrive: brand-new posts default to `MediumRisk` until Grok classifies them (`brand_safety.rs:47-51`). This is unavoidable but suggests **don't expect immediate engagement on a fresh post; the 30-min to 1-hour bucket is when Grok labels typically resolve.**
- Engagement bait — explicitly caught by `BangerInitialScreenClassifier.slop_score` (`banger_initial_screen.py:37`).
- Repeated mention chains in early posts — likely caught by `SpamEapiLowFollowerClassifier` (`spam.py:25`) since @SkillOS is still a low-follower account.

---

## Appendix: Source file references

```
home-mixer/scorers/ranking_scorer.rs                      (primary weight blender, new-user logic)
home-mixer/scorers/weighted_scorer.rs                     (older weighted scorer, same shape)
home-mixer/scorers/phoenix_scorer.rs                      (cold-start cluster routing at scoring)
home-mixer/scorers/author_diversity_scorer.rs             (geometric decay per repeated author)
home-mixer/scorers/oon_scorer.rs                          (out-of-network penalty multiplier)
home-mixer/scorers/vm_ranker.rs                           (secondary V/M ranker with author_followers_count)
home-mixer/filters/age_filter.rs                          (MAX_POST_AGE drop)
home-mixer/filters/author_socialgraph_filter.rs           (block/mute hard drops)
home-mixer/filters/muted_keyword_filter.rs                (tokenized keyword match)
home-mixer/filters/vf_filter.rs                           (visibility-filter drop)
home-mixer/filters/video_filter.rs                        (exclude-videos toggle)
home-mixer/filters/new_user_topic_ids_filter.rs           (topic-narrowing for new users)
home-mixer/selectors/top_k_score_selector.rs              (TOP_K_CANDIDATES_TO_SELECT param)
home-mixer/models/brand_safety.rs                         (14 medium-risk labels, PTOS cutoff, BotMaker rule categories)
home-mixer/ads/util.rs                                    (MIN_POSTS_FOR_ADS=5, MIN_REQUESTED_GAP=3, BSR adjacency)
home-mixer/candidate_hydrators/following_replied_users_hydrator.rs  (VIEWER_FOLLOWERS_THRESHOLD=1000)
home-mixer/candidate_hydrators/tweet_type_metrics_hydrator.rs        (follower buckets, age buckets, video buckets)
home-mixer/candidate_hydrators/mutual_follow_jaccard_hydrator.rs     (MIN_HASHES=256, viewer/author audience overlap)
home-mixer/candidate_hydrators/gizmoduck_hydrator.rs                 (author_followers_count fetch)
home-mixer/candidate_hydrators/subscription_hydrator.rs              (premium author tagging)
home-mixer/query_hydrators/user_action_seq_query_hydrator.rs         (UAS_WINDOW_TIME_MS, UAS_MAX_SEQUENCE_LENGTH)
home-mixer/query_hydrators/impression_bloom_filter_query_hydrator.rs (probabilistic seen-filter, false_positive_rate)
home-mixer/sources/push_to_home_source.rs                            (MAX_REPLIERS=3 facepile)
home-mixer/sources/phoenix_source.rs                                 (cold-start cluster routing at retrieval)
home-mixer/sources/tweet_mixer_source.rs                             (alternate OON candidate source)
grox/classifiers/content/spam.py                                     (SpamEapiLowFollowerClassifier, stricter for low followers)
grox/classifiers/content/banger_initial_screen.py                    (quality_score >= 0.4 threshold, slop_score)
grox/classifiers/content/safety_ptos.py                              (7 hard-policy categories)
phoenix/README.md                                                    (two-tower retrieval, candidate-isolation masking)
README.md                                                            (top-level architecture, May 2026 deltas)
```

**Source commit log file**: `/tmp/x-algo-source-commit.txt`
**2025-2026 commit window**: `/tmp/x-algo-2025-2026-commits.txt`

**Caveat (repeated for emphasis):** numeric blend weights, the OON factor, the new-user thresholds, `MAX_POST_AGE`, `MinVideoDurationMs`, `NEW_USER_OON_WEIGHT_FACTOR`, `NEW_USER_MIN_FOLLOWING`, `NEGATIVE_SCORES_OFFSET`, and the `xai_feature_switches::Params` registry are **not present in the public source**. Assume xAI runs additional private layers (botmaker rule-id semantics, ad-adjacency thresholds, the precise `SpamSystemLowFollower` prompt) that are not auditable from this release.
