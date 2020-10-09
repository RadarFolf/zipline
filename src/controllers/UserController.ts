import { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';
import {
  Controller,
  GET,
  POST,
  PATCH,
  FastifyInstanceToken,
  Inject,
} from 'fastify-decorators';
import { Repository } from 'typeorm';
import { User } from '../entities/User';
import {
  UserNotFoundError,
  MissingBodyData,
  LoginError,
  UserExistsError,
} from '../lib/api/APIErrors';
import {
  checkPassword,
  createBaseCookie,
  createToken,
  encryptPassword,
  readBaseCookie,
} from '../lib/Encryption';

@Controller('/api/user')
export class UserController {
  @Inject(FastifyInstanceToken)
  private instance!: FastifyInstance;

  private users: Repository<User> = this.instance.orm.getRepository(User);

  @GET('/login-status')
  async loginStatus(req: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      user: !!req.cookies.zipline,
    });
  }

  @GET('/')
  async currentUser(req: FastifyRequest, reply: FastifyReply) {
    if (!req.cookies.zipline) throw new LoginError('Not logged in.');
    const user = await this.users.findOne({
      where: {
        id: readBaseCookie(req.cookies.zipline),
      },
    });
    if (!user) throw new UserExistsError('User doesn\'t exist');
    delete user.password;
    return reply.send(user);
  }

  @PATCH('/')
  async editUser(req: FastifyRequest<{ Body: { username: string, password: string } }>, reply: FastifyReply) {
    if (!req.cookies.zipline) throw new LoginError('Not logged in.');

    const user = await this.users.findOne({
      where: {
        id: readBaseCookie(req.cookies.zipline),
      },
    });
    if (!user) throw new UserExistsError('User doesn\'t exist');

    user.username = req.body.username;
    user.password = encryptPassword(req.body.password);
    this.users.save(user);

    delete user.password;
    return reply.send(user);
  }

  @POST('/login')
  async login(
    req: FastifyRequest<{ Body: { username: string; password: string } }>,
    reply: FastifyReply
  ) {
    if (req.cookies.zipline) throw new LoginError('Already logged in.');
    if (!req.body.username) throw new MissingBodyData('Missing username.');
    if (!req.body.password) throw new MissingBodyData('Missing uassword.');

    const user = await this.users.findOne({
      where: {
        username: req.body.username,
      },
    });

    if (!user)
      throw new UserNotFoundError(`User "${req.body.username}" was not found.`);
    if (!checkPassword(req.body.password, user.password))
      throw new LoginError('Wrong credentials!');
    delete user.password;

    reply.setCookie('zipline', createBaseCookie(user.id), { path: '/' });
    return reply.send(user);
  }

  @POST('/logout')
  async logout(req: FastifyRequest, reply: FastifyReply) {
    if (!req.cookies.zipline) throw new LoginError('Not logged in.');
    try {
      reply.clearCookie('zipline', { path: '/' });
      return reply.send({ clearStore: true });
    } catch (e) {
      reply.send({ clearStore: false });
    }
  }

  @POST('/reset-token')
  async resetToken(req: FastifyRequest, reply: FastifyReply) {
    if (!req.cookies.zipline) throw new LoginError('Not logged in.');

    const user = await this.users.findOne({
      where: {
        id: readBaseCookie(req.cookies.zipline),
      },
    });

    if (!user) throw new UserNotFoundError('User was not found.');

    user.token = createToken();
    this.users.save(user);

    return reply.send({ updated: true });
  }

  @POST('/create')
  async create(
    req: FastifyRequest<{
      Body: { username: string; password: string; administrator: boolean };
    }>,
    reply: FastifyReply
  ) {
    if (!req.body.username) throw new MissingBodyData('Missing username.');
    if (!req.body.password) throw new MissingBodyData('Missing uassword.');

    const existing = await this.users.findOne({
      where: { username: req.body.username },
    });
    if (existing) throw new UserExistsError('User exists already');

    try {
      const user = await this.users.save(
        new User(
          req.body.username,
          encryptPassword(req.body.password),
          createToken(),
          req.body.administrator || false
        )
      );
      delete user.password;
      return reply.send(user);
    } catch (e) {
      throw new Error(`Could not create user: ${e.message}`);
    }
  }

  // @Hook('preValidation')
  // public async preValidation(req: FastifyRequest, reply: FastifyReply) {
  //   // const adminRoutes = ['/api/user/create'];
  //   // if (adminRoutes.includes(req.routerPath)) {
  //   //   if (!req.cookies.zipline) return reply.send({ error: "You are not logged in" });
  //   //   const admin = await this.instance.mongo.db.collection('zipline_users').findOne({ _id: req.cookies.zipline });
  //   //   if (!admin) return reply.send({ error: "You are not an administrator" });
  //   //   return;
  //   // }
  //   // return;
  // }
}
