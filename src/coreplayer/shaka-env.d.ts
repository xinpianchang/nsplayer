export default {}

declare module 'shaka-player' {
  namespace Player {
    export interface ErrorEvent extends CustomEvent<shaka.util.Error> {
      type: 'error'
    }

    /** Fired after the manifest has been parsed, but before anything else happens. The manifest may contain streams that will be filtered out, at this stage of the loading process. */
    export interface ManifestParsedEvent extends Event {
      type: 'manifestparsed'
    }

    /** Triggers after metadata associated with the stream is found. Usually they are metadata of type ID3. */
    export interface MetadataEvent extends Event {
      type: 'metadata'
      startTime: number
      endTime?: number | null
      metadataType: string
      payload: shaka.extern.ID3Metadata
    }

    /** Fired after the manifest has been parsed and track information is available, but before streams have been chosen and before any segments have been fetched. You may use this event to configure the player based on information found in the manifest. */
    export interface StreamingEvent extends Event {
      type: 'streaming'
    }

    /** Fired when the player begins loading. The start of loading is defined as when the user has communicated intent to load content (i.e. Player.load has been called). */
    export interface LoadingEvent extends Event {
      type: 'loading'
    }

    /** Fired when the player ends the load. */
    export interface LoadedEvent extends Event {
      type: 'loaded'
    }

    export interface EmsgEvent extends CustomEvent<shaka.extern.EmsgInfo> {
      type: 'emsg'
    }

    /** Fired when an automatic adaptation causes the active tracks to change. Does not fire when the application calls selectVariantTrack(), selectTextTrack(), selectAudioLanguage(), or selectTextLanguage(). */
    export interface AdaptationEvent extends Event {
      type: 'adaptation'
    }

    /** Fired when the player's buffering state changes. */
    export interface BufferingEvent extends Event {
      type: 'buffering'
      /** True when the Player enters the buffering state. False when the Player leaves the buffering state. */
      buffering: boolean
    }

    /** Fired when the state of abr has been changed. (Enabled or disabled). */
    export interface AbrStatusChangedEvent extends Event {
      type: 'abrstatuschanged'
      /** The new status of the application. True for 'is enabled' and false otherwise. */
      newStatus: boolean
    }

    /** Fired when the list of tracks changes. For example, this will happen when new tracks are added/removed or when track restrictions change. */
    export interface TracksChangedEvent extends Event {
      type: 'trackschanged'
    }

    /** Fired when a call from the application caused a variant change. Can be triggered by calls to selectVariantTrack() or selectAudioLanguage(). Does not fire when an automatic adaptation causes a variant change. */
    export interface VariantChangedEvent extends Event {
      type: 'variantchanged'
    }
  }
}
