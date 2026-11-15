import type { ReactElement } from "react";

import type { EntrantProfile } from "@sf-fight-club/schemas";
import { CrewCanvas, MascotCanvas } from "../art/sprites.js";
import { MASCOT_CLASS_INFO, classForCategory } from "../art/palette.js";
import { CloutMeter, TitleBadge, classNames } from "../styles/components.js";
import type { FighterCardProps } from "./types.js";

/** Links leave the building only over http and https. */
export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.trim();
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

export interface PostMetric {
  label: string;
  value: number;
}

export function mainMetric(metrics: EntrantProfile["posts"][number]["metrics"]): PostMetric | null {
  const ranked: readonly { key: keyof typeof metrics; label: string }[] = [
    { key: "views", label: "views" },
    { key: "points", label: "points" },
    { key: "likes", label: "likes" },
    { key: "reposts", label: "reposts" },
    { key: "replies", label: "replies" },
    { key: "comments", label: "comments" },
  ];
  for (const entry of ranked) {
    const value = metrics[entry.key];
    if (typeof value === "number" && value > 0) return { label: entry.label, value };
  }
  return null;
}

function sourceLabel(source: EntrantProfile["posts"][number]["source"]): string {
  switch (source) {
    case "x":
      return "X";
    case "hn":
      return "HN";
    case "web":
      return "WEB";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

function founderHandle(founder: EntrantProfile["founders"][number]): string {
  return founder.xHandle ?? founder.hnUser ?? founder.name;
}

export function FighterCard({
  entrant,
  profile,
  title,
  headcount,
  seed,
  tier,
  buildHash,
}: FighterCardProps): ReactElement {
  const classId = classForCategory(entrant.category);
  const dense = profile.founders.length >= 3;
  const className = MASCOT_CLASS_INFO[classId].label;
  const posts = profile.posts.slice(0, 2);
  const extraPosts = profile.posts.length - posts.length;

  return (
    <article className={classNames("fighter-card", dense && "fighter-card--dense")} data-testid="fighter-card">
      <header className="fighter-card__band">
        <span className="fighter-card__seed">#{seed}</span>
        <span className="fighter-card__tier" aria-label={`Tier ${tier}`}>
          {tier}
        </span>
        <TitleBadge title={title} headcount={headcount} className="fighter-card__title" />
      </header>

      <div className="fighter-card__art">
        <MascotCanvas
          spriteSeed={entrant.spriteSeed}
          category={entrant.category}
          size={dense ? 78 : 92}
          label={`${entrant.name} mascot`}
        />
        <span className="fighter-card__category">
          {className} / {entrant.category}
        </span>
      </div>

      <div className="fighter-card__identity">
        <h2 className="fighter-card__name">{profile.company.name}</h2>
        <p className="fighter-card__line">{profile.company.tagline ?? entrant.oneLiner}</p>
      </div>

      <div className="fighter-card__clout">
        <CloutMeter score={profile.clout.score} tier={profile.clout.tier} />
        <p className="fighter-card__note">Clout is for show. It never affects a fight.</p>
        {headcount > 1 ? <p className="fighter-card__headcount">Runs a company of {headcount}</p> : null}
      </div>

      <section className="fighter-card__section" aria-label="Founders">
        <p className="fighter-card__label">Founders</p>
        <ul className="fighter-card__founders">
          {profile.founders.map((founder) => (
            <li className="fighter-card__founder" key={`${founder.name}-${founderHandle(founder)}`}>
              <CrewCanvas
                handle={founderHandle(founder)}
                size={dense ? 18 : 20}
                label={`Generated crew figure for ${founder.name}`}
              />
              <span className="fighter-card__founder-text">
                <span className="fighter-card__founder-name">
                  {founder.name}
                  {founder.role !== undefined ? <em> / {founder.role}</em> : null}
                </span>
                <span className="fighter-card__founder-handles">
                  {founder.xHandle !== undefined ? `@${founder.xHandle}` : ""}
                  {founder.xHandle !== undefined && founder.hnUser !== undefined ? " / " : ""}
                  {founder.hnUser !== undefined ? `HN ${founder.hnUser}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="fighter-card__section fighter-card__posts" aria-label="Launch posts">
        <p className="fighter-card__label">
          Launch posts <span className="fighter-card__count">{profile.posts.length}</span>
        </p>
        {posts.map((post) => {
          const href = safeHttpUrl(post.url);
          const heading = post.title ?? firstLine(post.text);
          const metric = mainMetric(post.metrics);
          return (
            <article className="fighter-card__post" key={post.url}>
              <span className={classNames("fighter-card__source", `fighter-card__source--${post.source}`)}>
                {sourceLabel(post.source)}
              </span>
              <span className="fighter-card__post-body">
                <span className="fighter-card__post-title">{heading}</span>
                <span className="fighter-card__post-text">{post.text}</span>
                <span className="fighter-card__post-meta">
                  {metric ? (
                    <span className="fighter-card__metric">
                      {compactNumber(metric.value)} {metric.label}
                    </span>
                  ) : null}
                  {href !== null ? (
                    <a className="fighter-card__post-link" href={href} target="_blank" rel="noopener noreferrer">
                      Open post
                    </a>
                  ) : (
                    <span className="fighter-card__post-link fighter-card__post-link--off">No link</span>
                  )}
                </span>
              </span>
            </article>
          );
        })}
        {extraPosts > 0 ? <p className="fighter-card__more">+{extraPosts} more on the profile</p> : null}
      </section>

      <footer className="fighter-card__foot">BUILD {buildHash.toUpperCase()} · SAME AGENT AS EVERY FIGHTER</footer>
    </article>
  );
}
