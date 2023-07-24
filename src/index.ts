const RunService = game.GetService("RunService");
import { Janitor } from "@rbxts/janitor";

const randomLib = new Random((os.clock() % 1) * 1e7);
let renderId = 0;

type OnUpdate = (position: Vector3, rotation: Vector3, completed: boolean) => void;
type UpdateTuple = [position: Vector3, rotation: Vector3, completed: boolean];

export default class Shake {
	/**
	 * Amplitude of the overall shake. For instance, an amplitude of `3` would mean the
	 * peak magnitude for the outputted shake vectors would be about `3`.
	 */
	public Amplitude = 1;

	/**
	 * How long it takes for the shake to fade in, measured in seconds.
	 */
	public FadeInTime = 1;

	/**
	 * How long it takes for the shake to fade out, measured in seconds.
	 */
	public FadeOutTime = 1;

	/**
	 * Frequency of the overall shake. This changes how slow or fast the
	 * shake occurs.
	 */
	public Frequency = 1;

	/**
	 * Whether or not the shake effect is currently active.
	 */
	public IsShaking = false;

	/**
	 * The function used to generate the noise. Default is `math.noise`.
	 */
	public NoiseFunction: (x: number, y: number) => number = math.noise;

	/**
	 * This is similar to `Amplitude` but multiplies against each axis
	 * of the resultant shake vector, and only affects the position vector.
	 */
	public PositionInfluence = Vector3.one;

	/**
	 * This is similar to `Amplitude` but multiplies against each axis
	 * of the resultant shake vector, and only affects the rotation vector.
	 */
	public RotationInfluence = Vector3.one;

	/**
	 * If `true`, the shake will sustain itself indefinitely once it fades
	 * in. If `StopSustain()` is called, the sustain will end and the shake
	 * will fade out based on the `FadeOutTime`.
	 */
	public Sustain = false;

	/**
	 * How long it takes for the shake sustains itself after fading in and
	 * before fading out.
	 *
	 * To sustain a shake indefinitely, set `Sustain`
	 * to `true`, and call the `StopSustain()` method to stop the sustain
	 * and fade out the shake effect.
	 */
	public SustainTime = 0;

	/**
	 * The function used to get the current time. This defaults to
	 * `time` during runtime, and `os.clock` otherwise. Usually this
	 * will not need to be set, but it can be optionally configured
	 * if desired.
	 */
	public TimeFunction: () => number = RunService.IsRunning() ? time : os.clock;

	/**
	 * Apply an inverse square intensity multiplier to the given vector based on the
	 * distance away from some source. This can be used to simulate shake intensity
	 * based on the distance the shake is occurring from some source.
	 *
	 * @param origin
	 * @param distance
	 * @returns The intensity vector.
	 */
	public static InverseSquare = (origin: Vector3, distance: number): Vector3 => {
		if (distance < 1) distance = 1;
		const intensity = 1 / (distance * distance);
		return origin.mul(intensity);
	};

	/**
	 * Returns a unique render name for every call, which can
	 * be used with the `BindToRenderStep` method optionally.
	 *
	 * @returns A new render name.
	 */
	public static NextRenderName = (): string => {
		renderId += 1;
		return "__shake_%.4i__".format(renderId);
	};

	/**
	 * Creates a new Shake instance.
	 */
	public constructor() {
		this.TimeOffset = randomLib.NextNumber(-1e9, 1e9);
		this.StartTime = 0;
		this.Janitor = new Janitor();
	}

	/**
	 * Start the shake effect.
	 *
	 * This **must** be called before calling `Update`. As such, it should also be
	 * called once before or after calling `OnSignal` or `BindToRenderStep` methods.
	 */
	public Start() {
		this.StartTime = this.TimeFunction();
		this.IsShaking = true;
		this.Janitor.Add(() => {
			this.IsShaking = false;
		}, true);
	}

	/**
	 * Stops the shake effect. If using `OnSignal` or `BindToRenderStep`, those bound
	 * functions will be disconnected/unbound.
	 *
	 * `Stop` is automatically called when the shake effect is completed _or_ when the
	 * `Destroy` method is called.
	 */
	public Stop() {
		this.Janitor.Cleanup();
	}

	/**
	 * Schedules a sustained shake to stop. This works by setting the
	 * `Sustain` field to `false` and letting the shake effect fade out
	 * based on the `FadeOutTime` field.
	 */
	public StopSustain() {
		const currentTime = this.TimeFunction();
		this.Sustain = false;
		this.SustainTime = currentTime - this.StartTime - this.FadeInTime;
	}

	/**
	 * Calculates the current shake vector. This should be continuously
	 * called inside a loop, such as `RunService.Heartbeat`. Alternatively,
	 * `OnSignal` or `BindToRenderStep` can be used to automatically call
	 * this function.
	 * @returns An update tuple.
	 */
	public Update(): LuaTuple<UpdateTuple> {
		let done = false;
		const currentTime = this.TimeFunction();
		const duration = currentTime - this.StartTime;
		const noiseInput = ((currentTime + this.TimeOffset) / this.Frequency) % 1000000;
		const noiseFunction = this.NoiseFunction;

		const fadeInTime = this.FadeInTime;

		let multiplierFadeIn = 1;
		let multiplierFadeOut = 1;
		if (duration < fadeInTime) multiplierFadeIn = duration / fadeInTime;

		if (!this.Sustain && duration > fadeInTime + this.SustainTime) {
			multiplierFadeOut = 1 - (duration - fadeInTime - this.SustainTime) / this.FadeOutTime;
			if (!this.Sustain && duration >= fadeInTime + this.SustainTime + this.FadeOutTime) done = true;
		}

		const offset = new Vector3(
			noiseFunction(noiseInput, 0) / 2,
			noiseFunction(0, noiseInput) / 2,
			noiseFunction(noiseInput, noiseInput) / 2,
		)
			.mul(this.Amplitude)
			.mul(math.min(multiplierFadeIn, multiplierFadeOut));

		if (done) this.Janitor.Cleanup();
		return $tuple(this.PositionInfluence.mul(offset), this.RotationInfluence.mul(offset), done);
	}

	/**
	 * Bind the `Update` method to a signal. For instance, this can be used
	 * to connect to `RunService.Heartbeat`.
	 *
	 * All connections are cleaned up when the shake instance is stopped
	 * or destroyed.
	 *
	 * @param signal The signal to connect with.
	 * @param callback The function that will be called.
	 * @returns The connection object.
	 */
	public OnSignal(
		signal: { Connect: (callback: () => void) => { Disconnect: () => void } },
		callback: OnUpdate,
	): RBXScriptConnection {
		return this.Janitor.Add(
			signal.Connect(() => {
				const [position, rotation, completed] = this.Update();
				callback(position, rotation, completed);
			}),
			"Disconnect",
		) as RBXScriptConnection;
	}

	/**
	 * Bind the `Update` method to RenderStep.
	 *
	 * All bound functions are cleaned up when the shake instance is stopped
	 * or destroyed.
	 *
	 * @param name Name passed to `RunService:BindToRenderStep`
	 * @param priority Priority passed to `RunService:BindToRenderStep`
	 * @param callback
	 */
	public BindToRenderStep(name: string, priority: number, callback: OnUpdate) {
		RunService.BindToRenderStep(name, priority, () => {
			const [position, rotation, completed] = this.Update();
			callback(position, rotation, completed);
		});

		this.Janitor.Add(() => {
			RunService.UnbindFromRenderStep(name);
		}, true);
	}

	/**
	 * Creates a new shake with identical properties as
	 * this one. This does _not_ clone over playing state,
	 * and thus the cloned instance will be in a stopped
	 * state.
	 *
	 * A use-case for using `Clone` would be to create a module
	 * with a list of shake presets. These presets can be cloned
	 * when desired for use. For instance, there might be presets
	 * for explosions, recoil, or earthquakes.
	 *
	 * @returns A new shake instance.
	 */
	public Clone(): Shake {
		const newShake = new Shake();

		newShake.Amplitude = this.Amplitude;
		newShake.FadeInTime = this.FadeInTime;
		newShake.FadeOutTime = this.FadeOutTime;
		newShake.Frequency = this.Frequency;
		newShake.NoiseFunction = this.NoiseFunction;
		newShake.PositionInfluence = this.PositionInfluence;
		newShake.RotationInfluence = this.RotationInfluence;
		newShake.Sustain = this.Sustain;
		newShake.SustainTime = this.SustainTime;
		newShake.TimeFunction = this.TimeFunction;

		return newShake;
	}

	/**
	 * Destroy the Shake instance.
	 */
	public Destroy() {
		this.Janitor.Destroy();
		setmetatable(this, undefined!);
	}

	private readonly Janitor: Janitor;
	private StartTime: number;
	private readonly TimeOffset: number;
}
