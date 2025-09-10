<p align="center">
<img src="https://github.com/dahvidschloss/SimpleJack/blob/main/simpleJack.png" width="200"/>
</p>

# SimpleJack C2 — A Training C2 Framework

Is it good? No.  
Is it great? Absolutely not.  
But is it ok-ish? Not even close.  

What it **is**, however, is a tool to help you understand how C2 frameworks operate, how defenders can spot them, and why real-world threat actors bother making theirs far more advanced. Think of SimpleJack as bringing an RPG to a CQB fight. Sure, you might hit the target… but you’re going to blow yourself up in the process.

Its got more security flaws than the Tea App


## Purpose

SimpleJack exists purely for **training and education**. It is intentionally stripped down and deliberately unsafe by design. This is not meant for operations, testing on production networks, or anything remotely resembling “real red teaming.”  

I mean you COULD use it for red team stuff, but like why would you. There are better fleshed out C2s out there. 


## What You Get (and Don’t Get)

- No logins, No Users, No Operations (just straight up webpage)
- No agent builders  
- No pre-packaged malware  
- No encryption (by default)
- No stealth features (sorta, it has the capability to do stealth features but just not obvious)
- All Bullshit

Just raw mechanics to learn: how sessions register, how callbacks work, how to build taskings and how defenders can spot them.


## Supported Listener Profiles

Right now there are only two:

- **HTTP**  
- **TCP**

That’s it. Don’t ask for DNS, QUIC, ICMP,Slack, Discord, Steam, or some fancy obfuscation layer. If you want that, build it yourself. Which is kinda the point. 

I'm also just working on those slowly so don't blame me when you try and register a DNS listener and the server shits the bed


## HTTP Register Flow

1. **POST** to the server with your agent key.  
2. Server returns a `session_id` key.  
3. Agent must include the rotated `session_id` in every GET after that.  
4. Screw it up? You’ll hit the **decoy response** instead.  


## How to Use

1. Spin up a listener (HTTP or TCP).  
2. Write a barebones agent that follows the register flow.  
3. Watch it work (or fail).  
4. Pay attention to the noise it generatesm because a defender definitely will.

## How to Build an Agent

Step one: create a listener.  
- Just follow the *listener wizard* for your agent and it’ll spit one out.  

Step two: grab your keys.  
- Go to the listener you just built.  
- Copy down the `agent_key`.  
- Set your `Agent_name` to whatever creative nonsense you want to call it.  

Step three: make it check in.  
- When you build the agent, it needs to pass that listener’s key during the `checkIn` request.  
- If it doesn’t, congrats, you’ve built a broken agent.  

Step four: cheat off the example.  
- We provide a **simple PowerShell check-in script** called `Toilet_Oracle.ps1`.  
- It’s barebones, ugly, and obvious, and it prints literally every request and reponse body, but its exactly what you need to see how the flow works before you go off and make your own flavor.  

## Reminder

This is a **teaching tool**. If you try to “operationalize” this, I won't pay you, but I may be interested in what you got going on . The goal is to break it, learn from it, and maybe even improve it, if you are into that kind of thing, not to turn it into something it was never meant to be, like a ransomware tool.


### License

Training use only. Not for crime, but like i'm not your dad, you do you. 
