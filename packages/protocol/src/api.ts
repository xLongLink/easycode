import { Context } from "effect"
import { HttpApi, HttpApiGroup, HttpApiMiddleware, OpenApi } from "effect/http-api"
import { SchemaErrorMiddleware } from "./middleware/schema-error.js"
import { GenerateGroup } from "./groups/generate.js"
import { MessageGroup } from "./groups/message.js"
import { ModelGroup } from "./groups/model.js"
import { ProviderGroup } from "./groups/provider.js"
import { makeSessionGroup } from "./groups/session.js"
import { makePermissionGroup } from "./groups/permission.js"
import { FileSystemGroup } from "./groups/fs.js"
import { makeFormGroup } from "./groups/form.js"
import { CommandGroup } from "./groups/command.js"
import { SkillGroup } from "./groups/skill.js"
import { RpcGroup } from "./groups/rpc.js"
import { EventGroup } from "./groups/event.js"
import { AgentGroup } from "./groups/agent.js"
import { PluginGroup } from "./groups/plugin.js"
import { ServerGroup } from "./groups/server.js"
import { DebugGroup } from "./groups/debug.js"
import { makePtyGroup } from "./groups/pty.js"
import { PersistentPtyGroup } from "./groups/persistent-pty.js"
import { ShellGroup } from "./groups/shell.js"
import { ReferenceGroup } from "./groups/reference.js"
import { Authorization } from "./middleware/authorization.js"
import { makeLocationGroup } from "./groups/location.js"
import { IntegrationGroup } from "./groups/integration.js"
import { WebSearchGroup } from "./groups/websearch.js"
import { McpGroup } from "./groups/mcp.js"
import { CredentialGroup } from "./groups/credential.js"
import { ProjectGroup } from "./groups/project.js"
import { WorktreeGroup } from "./groups/worktree.js"
import { VcsGroup } from "./groups/vcs.js"
import { MigrationGroup } from "./groups/migration.js"
import { ConfigGroup } from "./groups/config.js"

type LocationGroups<LocationId extends HttpApiMiddleware.AnyId> =
  | HttpApiGroup.AddMiddleware<typeof AgentGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof PluginGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof ModelGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof ProviderGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof IntegrationGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof WebSearchGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof McpGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof ProjectGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof FileSystemGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof CommandGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof SkillGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof RpcGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof ShellGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof ReferenceGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof VcsGroup, LocationId>
  | HttpApiGroup.AddMiddleware<typeof ConfigGroup, LocationId>

type PtyGroups<LocationId extends HttpApiMiddleware.AnyId, LocationService> = ReturnType<
  typeof makePtyGroup<LocationId, LocationService>
>

type SessionGroups<
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
  FormLocationId extends HttpApiMiddleware.AnyId,
  FormLocationService,
> =
  | ReturnType<typeof makeSessionGroup<SessionLocationId, SessionLocationService, FormLocationId, FormLocationService>>
  | typeof MessageGroup

type FormGroups<LocationId extends HttpApiMiddleware.AnyId, LocationService> = ReturnType<
  typeof makeFormGroup<LocationId, LocationService>
>

type LocationGroup<LocationId extends HttpApiMiddleware.AnyId, LocationService> = ReturnType<
  typeof makeLocationGroup<LocationId, LocationService>
>

type MixedMiddlewareGroups<
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
> = ReturnType<typeof makePermissionGroup<LocationId, LocationService, SessionLocationId, SessionLocationService>>

type ApiGroups<
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  FormLocationId extends HttpApiMiddleware.AnyId,
  FormLocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
> =
  | typeof ServerGroup
  | typeof DebugGroup
  | typeof MigrationGroup
  | typeof WorktreeGroup
  | typeof GenerateGroup
  | typeof PersistentPtyGroup
  | typeof CredentialGroup
  | LocationGroups<LocationId>
  | LocationGroup<LocationId, LocationService>
  | PtyGroups<LocationId, LocationService>
  | FormGroups<LocationId, LocationService>
  | SessionGroups<SessionLocationId, SessionLocationService, FormLocationId, FormLocationService>
  | MixedMiddlewareGroups<LocationId, LocationService, SessionLocationId, SessionLocationService>
  | typeof EventGroup

export type Api<
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  FormLocationId extends HttpApiMiddleware.AnyId,
  FormLocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
> = HttpApi.HttpApi<
  "server",
  HttpApiGroup.AddMiddleware<
    HttpApiGroup.AddMiddleware<
      ApiGroups<
        LocationId,
        LocationService,
        FormLocationId,
        FormLocationService,
        SessionLocationId,
        SessionLocationService
      >,
      Authorization
    >,
    SchemaErrorMiddleware
  >
>

// Protocol owns middleware placement, while Server injects concrete keys so Core service identities stay downstream.
export const makeDefaultApi = <
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  FormLocationId extends HttpApiMiddleware.AnyId,
  FormLocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(options: {
  readonly locationMiddleware: Context.Key<LocationId, LocationService>
  readonly formLocationMiddleware: Context.Key<FormLocationId, FormLocationService>
  readonly sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>
}): Api<LocationId, LocationService, FormLocationId, FormLocationService, SessionLocationId, SessionLocationService> =>
  HttpApi.make("server")
    .add(ServerGroup)
    .add(makeLocationGroup(options.locationMiddleware))
    .add(AgentGroup.middleware(options.locationMiddleware))
    .add(PluginGroup.middleware(options.locationMiddleware))
    .add(makeSessionGroup(options.sessionLocationMiddleware, options.formLocationMiddleware))
    .add(MessageGroup)
    .add(ModelGroup.middleware(options.locationMiddleware))
    .add(GenerateGroup)
    .add(ProviderGroup.middleware(options.locationMiddleware))
    .add(IntegrationGroup.middleware(options.locationMiddleware))
    .add(McpGroup.middleware(options.locationMiddleware))
    .add(CredentialGroup)
    .add(ProjectGroup.middleware(options.locationMiddleware))
    .add(makeFormGroup(options.locationMiddleware))
    .add(makePermissionGroup(options.locationMiddleware, options.sessionLocationMiddleware))
    .add(FileSystemGroup.middleware(options.locationMiddleware))
    .add(CommandGroup.middleware(options.locationMiddleware))
    .add(SkillGroup.middleware(options.locationMiddleware))
    .add(RpcGroup.middleware(options.locationMiddleware))
    .add(EventGroup)
    .add(makePtyGroup(options.locationMiddleware))
    .add(PersistentPtyGroup)
    .add(ShellGroup.middleware(options.locationMiddleware))
    .add(ReferenceGroup.middleware(options.locationMiddleware))
    .add(WorktreeGroup)
    .add(VcsGroup.middleware(options.locationMiddleware))
    .add(DebugGroup)
    .add(MigrationGroup)
    .add(WebSearchGroup.middleware(options.locationMiddleware))
    .add(ConfigGroup.middleware(options.locationMiddleware))
    .annotateMerge(
      OpenApi.annotations({
        title: "opencode HttpApi",
        version: "0.0.1",
        description: "Experimental HttpApi surface for selected instance routes.",
      }),
    )
    .middleware(Authorization)
    .middleware(SchemaErrorMiddleware)
