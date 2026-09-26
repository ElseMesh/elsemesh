// Provider-independent agent commands drive Player through the existing Input contract.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class AgentInput {
	constructor(player) { this.player = player; this.command = { tool: 'stop' }; this.target = null; this.jumpOnce = false; }
	move_forward(duration = 1) { this.command = { tool: 'move_forward', until: performance.now() + clamp(duration, 0, 10) * 1000 }; }
	move_backward(duration = 1) { this.command = { tool: 'move_backward', until: performance.now() + clamp(duration, 0, 10) * 1000 }; }
	turn_left(angle) { this.command = { tool: 'turn', targetYaw: this.player.yaw + clamp(angle, 0, Math.PI) }; }
	turn_right(angle) { this.command = { tool: 'turn', targetYaw: this.player.yaw - clamp(angle, 0, Math.PI) }; }
	look_at(target) { this.command = { tool: 'look_at', target }; }
	walk_to(position) { this.command = { tool: 'walk_to', target: position }; }
	follow_player(playerId = 'player:loz') { this.command = { tool: 'follow_player', playerId }; }
	stop() { this.command = { tool: 'stop' }; }
	jump() { this.jumpOnce = true; }
	interact(target) { this.command = { tool: 'interact', target }; }
	setTarget(state) { this.target = state; }
	#destination() {
		if (this.command.tool === 'follow_player') return this.target?.position;
		if (this.command.tool === 'walk_to' || this.command.tool === 'look_at') return this.command.target;
		return null;
	}
	moveAxes() {
		const command = this.command;
		if (command.tool === 'move_forward' || command.tool === 'move_backward') return { x: 0, y: performance.now() < command.until ? (command.tool === 'move_forward' ? 1 : -1) : 0, sprint: 0 };
		const destination = this.#destination();
		if (!destination || command.tool === 'look_at') return { x: 0, y: 0, sprint: 0 };
		const distance = Math.hypot(destination[0] - this.player.position.x, destination[2] - this.player.position.z);
		return { x: 0, y: distance > (command.tool === 'follow_player' ? 3.3 : 0.7) ? 1 : 0, sprint: 0 };
	}
	consumeLook(dt) {
		const destination = this.#destination();
		let desired;
		if (destination) desired = Math.atan2(-(destination[0] - this.player.position.x), -(destination[2] - this.player.position.z));
		else if (this.command.tool === 'turn') desired = this.command.targetYaw;
		else return { x: 0, y: 0 };
		const delta = clamp(wrap(desired - this.player.yaw), -dt * 3.2, dt * 3.2);
		return { x: -delta / 0.0022, y: 0 };
	}
	down() { return false; }
	hit(code) { if (code === 'Space' && this.jumpOnce) { this.jumpOnce = false; return true; } return false; }
}
