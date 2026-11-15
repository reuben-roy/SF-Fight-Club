import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";

import { useAppStore } from "../data/index.js";
import { selectFilm } from "../data/store.js";
import { FilmRoom } from "./film-room.js";

export default function FilmEntry(): ReactElement {
  const { bundle, state } = useAppStore();
  const { matchId } = useParams();
  const view = matchId ? selectFilm(state, bundle, matchId) : null;
  if (!view) {
    return (
      <section aria-label="Film room">
        <h2>No such fight</h2>
        <p>
          <Link to="/tower">Back to the Tower</Link>
        </p>
      </section>
    );
  }
  return (
    <>
      <p>
        <Link to={`/match/${view.matchId}`}>Back to the fight</Link> <Link to="/tower">Tower</Link>
      </p>
      <FilmRoom view={view} />
    </>
  );
}
