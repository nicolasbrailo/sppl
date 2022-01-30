import { CollectionManager } from './CollectionManager.js';
import { LocalStorageManager } from './LocalStorageManager.js';
import { RecentlyPlayed } from './RecentlyPlayed.js';
import { SpotifyLocalPlayer } from './SpotifyLocalPlayer.js';
import { SpotifyProxy } from './SpotifyProxy.js';
import { UiBuilder } from './UiBuilder.js';
import { UiMiniPlayerCtrl } from './UiMiniPlayerCtrl.js';
import { UiPeriodicUpdater } from './UiPeriodicUpdater.js';
import { UiSettings } from './UiSettings.js';

function main() {
  const spotify = new SpotifyProxy();
  const main_ui = new UiBuilder();
  const player_ui = new UiMiniPlayerCtrl(spotify);
  const storage = new LocalStorageManager();
  const settings = new UiSettings(storage);
  const recently_played = new RecentlyPlayed(storage, settings.recentlyPlayedCount);
  const collection_manager = new CollectionManager(storage, spotify);
  const tick = new UiPeriodicUpdater();

  // Make things public
  window.APP_spotify;
  window.APP_main_ui;
  window.APP_player_ui;
  window.APP_storage;
  window.APP_settings;
  window.APP_recently_played;
  window.APP_collection_manager;
  window.APP_tick;

  // No credentials? Bail out
  if (!spotify.canConnect()) {
    window.location = '/reauth.html';
    return;
  }

  // Interface with outside world events
  const ui_became_ready = $.Deferred();
  const spotify_webplayer_sdk_loaded = $.Deferred();
  window.onSpotifyWebPlaybackSDKReady = spotify_webplayer_sdk_loaded.resolve;
  document.addEventListener('DOMContentLoaded', ui_became_ready.resolve);


  // Handlers
  function rebuildRecentPlayed() {
    $('#recently_played').html(main_ui.buildRecentlyPlayed(recently_played.get()));
  }

  function rebuildMainUi() {
    main_ui.setCollection(collection_manager.genres_index, collection_manager.artist_index);
    $('#genres_idx').html(main_ui.buildGenresIndex());
    $('#arts_by_gen').html(main_ui.buildAllGenres());
    rebuildRecentPlayed();
  }

  function createLocalSpotifyClient() {
    const spotify_local_player = new SpotifyLocalPlayer('Spotiwebos', storage, spotify);
    // TODO: Bypass remote API maybe faster? spotify.setLocalPlayer(spotify_local_player);
    spotify_local_player.ready.then(player_ui.updateAvailableDevices);
    // Make it globally available
    window.APP_player = spotify_local_player;
  }

  collection_manager.ready.then(rebuildMainUi);

  main_ui.onExtendedViewClicked((tile_id, art_obj) => {
    const generator = () => { return spotify.fetchDiscographyFor(art_obj.id); };
    main_ui.toggleExtendedView(tile_id, art_obj, generator);
  });

  main_ui.onAlbumClicked((art_obj, album_uri) => {
    recently_played.add(art_obj.name);
    rebuildRecentPlayed();
    spotify.play(album_uri).then(player_ui.updatePlayingNow);

    if (settings.openLinksInNativeClient) {
      window.location = album_uri;
    }
  });

  main_ui.onArtistClicked((art_obj) => {
    recently_played.add(art_obj.name);
    rebuildRecentPlayed();
    spotify.play(art_obj.uri).then(player_ui.updatePlayingNow);

    if (settings.openLinksInNativeClient) {
      window.location = art_obj.uri;
    }
  });

  settings.onRecentlyPlayedCountChange(cnt => {
    recently_played.setRecentlyPlayedCount(cnt);
    rebuildRecentPlayed();
  });

  settings.onUserRequestedCacheRefresh(() => {
    collection_manager.refreshFollowedArtists().then(rebuildMainUi);
  });

  settings.onThingsAreBroken(() => {
    spotify_webplayer_sdk_loaded.then(createLocalSpotifyClient);
  });

  ui_became_ready.then(() => {
    settings.notifyUILoaded();
    player_ui.notifyUILoaded();
  });

  Promise.all([ui_became_ready, spotify.connect()]).then(() => {
    tick.installCallback(_ => { player_ui.onTick(); }, 10 * 1000);
  });

  spotify_webplayer_sdk_loaded.then(createLocalSpotifyClient);
}

main();
