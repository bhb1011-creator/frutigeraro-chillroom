import * as THREE from 'three';

// Third-person controls for the buddy.
//   Keyboard: WASD / arrows move (relative to the camera), Shift runs, Space jumps.
//   Mouse:    drag to turn the camera, wheel to zoom.
//   Touch:    left joystick moves, drag elsewhere turns the camera, button jumps.

const WALK = 4.2;
const RUN = 9;
const JUMP = 6.8;
const GRAVITY = 20;
const RADIUS = 0.45;
const HEIGHT = 1.45;
const MAX_STEP = 0.2; // metres per physics sub-step, keeps fast movement from slipping through walls

export class PlayerController {
  constructor({ player, camera, dom, world }) {
    this.player = player;
    this.camera = camera;
    this.world = world;
    this.keys = new Set();
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.yaw = player.rotation.y + Math.PI;
    this.pitch = 0.16;
    this.distance = 6.5;
    this.joystick = new THREE.Vector2();
    this.jumpQueued = false;
    this.cameraPos = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.firstUpdate = true;

    addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.jumpQueued = true;
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Camera orbit by dragging (mouse or a finger outside the joystick).
    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.target !== dom) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      this.yaw -= (e.clientX - drag.x) * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - drag.y) * 0.004, -0.15, 1.25);
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    const endDrag = (e) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', endDrag);
    dom.addEventListener(
      'wheel',
      (e) => {
        this.distance = THREE.MathUtils.clamp(this.distance * (1 + Math.sign(e.deltaY) * 0.1), 2.5, 16);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Hooks up the on-screen joystick and jump button (see hud.js). */
  bindTouch({ joystick, jump }) {
    const base = joystick;
    const knob = joystick.firstElementChild;
    let id = null;
    const move = (e) => {
      const r = base.getBoundingClientRect();
      const v = new THREE.Vector2(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      const max = r.width / 2;
      if (v.length() > max) v.setLength(max);
      knob.style.transform = `translate(${v.x}px, ${v.y}px)`;
      this.joystick.set(v.x / max, v.y / max);
    };
    base.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      base.setPointerCapture(id);
      move(e);
    });
    base.addEventListener('pointermove', (e) => e.pointerId === id && move(e));
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      this.joystick.set(0, 0);
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    jump.addEventListener('pointerdown', (e) => {
      this.jumpQueued = true;
      e.preventDefault();
    });
  }

  setPlayer(player) {
    player.position.copy(this.player.position);
    player.rotation.y = this.player.rotation.y;
    this.player = player;
  }

  update(dt) {
    const k = this.keys;
    const input = new THREE.Vector2(
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0),
    ).add(this.joystick);
    const amount = Math.min(1, input.length());
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || this.joystick.length() > 0.92;
    const speed = (running ? RUN : WALK) * amount;

    // Movement relative to the camera's heading.
    const wish = new THREE.Vector3();
    if (amount > 0.05) {
      input.normalize();
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      wish.set(input.x * cos + input.y * sin, 0, -input.x * sin + input.y * cos).normalize();
    }
    const accel = this.grounded ? 14 : 4;
    this.velocity.x += (wish.x * speed - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (wish.z * speed - this.velocity.z) * Math.min(1, accel * dt);

    if (this.jumpQueued && this.grounded) {
      this.velocity.y = JUMP;
      this.grounded = false;
    }
    this.jumpQueued = false;
    this.velocity.y -= GRAVITY * dt;

    // Move in small sub-steps, resolving walls each time.
    const pos = this.player.position;
    const travel = Math.hypot(this.velocity.x, this.velocity.z) * dt;
    const steps = Math.max(1, Math.ceil(travel / MAX_STEP));
    for (let i = 0; i < steps; i++) {
      pos.x += (this.velocity.x * dt) / steps;
      pos.z += (this.velocity.z * dt) / steps;
      this.world.resolve(pos, RADIUS, HEIGHT);
    }
    pos.y += this.velocity.y * dt;
    const ground = this.world.groundAt(pos.x, pos.z, Math.max(pos.y, pos.y - this.velocity.y * dt));
    if (pos.y <= ground) {
      pos.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (pos.y - ground > 0.08 || this.velocity.y > 0) {
      this.grounded = false;
    } else {
      // Glue to gentle slopes and stair steps going down.
      pos.y = ground;
      this.grounded = true;
    }

    // Face the direction of travel and pick the animation.
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontal > 0.3) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      let d = target - this.player.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.player.rotation.y += d * Math.min(1, dt * 10);
    }
    const anim = !this.grounded ? 'run' : horizontal > WALK + 1 ? 'run' : horizontal > 0.4 ? 'walk' : 'idle';
    this.player.userData.play(anim);
    this.player.userData.update(dt);

    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const target = this.player.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.distance);
    const desired = target.clone().add(offset);
    // Never dip below the floor under the camera.
    const floor = this.world.groundAt(desired.x, desired.z, desired.y) + 0.35;
    if (desired.y < floor) desired.y = floor;
    const k = this.firstUpdate ? 1 : 1 - Math.exp(-dt * 12);
    this.firstUpdate = false;
    this.cameraPos.lerp(desired, k);
    this.cameraTarget.lerp(target, k);
    if (k === 1) {
      this.cameraPos.copy(desired);
      this.cameraTarget.copy(target);
    }
    this.camera.position.copy(this.cameraPos);
    this.camera.lookAt(this.cameraTarget);
  }
}
