import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";

import { useAppStore } from "../data/index.js";
import { selectFilm } from "../data/store.js";
import { Panel } from "../styles/components.js";
import { FilmRoom } from "./film-room.js";

export default function FilmEntry(): ReactElement {
  const { bundle, state } = useAppStore();
  const { matchId } = useParams();
  const view = matchId ? selectFilm(state, bundle, matchId) : null;

  if (!view) {
    return (
      <div className="sfc-film" data-theme="paper">
        <div className="sfc-page sfc-film__inner">
          <Panel title="No such fight" stripe>
            <p>That match id is not on this card.</p>
            <p>
              <Link to="/tower">Back to the Tower</Link>
            </p>
          </Panel>
        </div>
      </div>
    );
  }

  return <FilmRoom view={view} />;
}
